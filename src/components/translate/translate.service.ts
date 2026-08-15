import { Injectable, Logger } from '@nestjs/common';

/**
 * Batched chat-message translation.
 *
 * ── WHY THIS LIVES SERVER-SIDE ─────────────────────────────────────────────────────────────────
 * The obvious implementation is to call the translation provider straight from the browser. That
 * would ship a live API key inside a public bundle (the UI is hosted on Netlify), so the call is
 * proxied here instead. Server-side also lets every client share one key pool and one cache.
 *
 * ── WHY A GROQ LLM AND NOT GOOGLE TRANSLATE ───────────────────────────────────────────────────
 * The corpus is ROMANISED Tamil/Telugu ("enna panra", "romba nalla iruku"), not Tamil script.
 * Measured 2026-08-15 against real messages:
 *
 *   input                  Google Translate (free endpoint)   llama-3.3-70b
 *   "enna panra"           "enna panra"  (unchanged)          "What are you doing"
 *   "romba nalla iruku"    "romba nalla iruku"  (unchanged)   "It's very nice"
 *   "Innum kiss than"      "Innum kiss than"  (unchanged)     "Still I kiss"
 *
 * Google also misdetected the language as Hawaiian and Croatian, and forcing sl=ta changed nothing:
 * it translates Tamil SCRIPT, not romanised Tamil. It would have shipped a button that looks like
 * it works and silently no-ops on nearly every message.
 *
 * ── CAPACITY ───────────────────────────────────────────────────────────────────────────────────
 * Limits are PER MODEL and were read from live response headers (see the model block below), not
 * from docs. Messages are batched (~20 per call) and size-capped because the binding constraint is
 * tokens/minute, not requests — a 200-message batch would 413.
 *
 * ── CONTEXT ────────────────────────────────────────────────────────────────────────────────────
 * Earlier turns are passed as REFERENCE ONLY. Measured 2026-08-15: supplying context fixed
 * ambiguous short replies ("apram" -> "later" instead of "anyway") but, WITHOUT the anti-invention
 * rules in buildPrompt, it also made the model hallucinate — "photo anuppu" became "Take a photo of
 * Anuppu" (invented name) and "sari" became "Ask her". Context plus explicit "do not invent" rules
 * gave the best result; context alone was WORSE than no context. Do not relax those rules.
 *
 * NOTE: the CLAUDE.md warning that "Groq is NOT usable" refers specifically to VISION models. Text
 * models are unaffected and are what this uses.
 */

export interface TranslateResult {
    readonly translations: string[];
    readonly provider: string;
    readonly cached: number;
}

/**
 * A message to translate. `speaker` is optional but materially improves short replies — the model
 * cannot tell who is answering whom from the text alone.
 */
export interface TranslateMessage {
    readonly text: string;
    readonly speaker?: string;
}

/**
 * Earlier turns supplied purely as REFERENCE. These are never translated or returned; they exist so
 * the model can resolve pronouns and implied subjects in the messages that ARE being translated.
 */
export interface TranslateContextTurn {
    readonly text: string;
    readonly speaker?: string;
}

/** How many prior turns to accept as context. Beyond this the token cost outweighs the benefit. */
export const MAX_CONTEXT_TURNS = 10;

/**
 * Model choice, benchmarked 2026-08-15 on real romanised-Tamil chat lines from this dataset.
 *
 * The hard case is ambiguous short replies ("apram", "sari", "pannuven") where the meaning depends
 * on surrounding turns. Scored against a known-correct reference:
 *
 *   openai/gpt-oss-120b     5/5   780-2100ms   <- primary
 *   groq/compound-mini      5/5   1000-1600ms  (only 250 req/day/key)
 *   llama-3.3-70b-versatile 3/5   ~400ms       <- fallback (fast, but misreads negation:
 *                                                 "kiss um venam onum venam" => "I want a kiss")
 *   llama-3.1-8b-instant    0/5   ~190ms       (unusable: "shirt", "I will go")
 *   qwen/qwen3.6-27b        n/a   3200ms       (leaks <think> reasoning into the output)
 *
 * Free-tier limits differ per model: gpt-oss-120b is 1,000 req/day/key (6,000 across the 6 keys in
 * GROQ_API_KEYS) at 8,000 TPM. At ~20 messages per batched call that is ~120,000 messages/day.
 * FALLBACK exists mainly to absorb the per-model daily cap and transient 429/5xx.
 */
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Keep each request well inside the 6,000 TPM ceiling. */
export const MAX_BATCH_SIZE = 20;
/** Messages longer than this are truncated before sending — chat lines are short in practice. */
const MAX_CHARS_PER_MESSAGE = 1000;
/** Bounded so a long-running process cannot grow this without limit. */
const MAX_CACHE_ENTRIES = 5000;
const REQUEST_TIMEOUT_MS = 20000;

@Injectable()
export class TranslateService {
    private readonly logger = new Logger(TranslateService.name);
    /** text -> translation. Chat history is re-scrolled constantly; the same lines recur. */
    private readonly cache = new Map<string, string>();
    private keyCursor = 0;

    private getKeys(): string[] {
        return String(process.env.GROQ_API_KEYS || '')
            .split(/[,\s]+/)
            .map(k => k.trim())
            .filter(Boolean);
    }

    /** Round-robin so no single key absorbs the whole daily quota. */
    private nextKey(keys: string[]): string {
        const key = keys[this.keyCursor % keys.length];
        this.keyCursor = (this.keyCursor + 1) % keys.length;
        return key;
    }

    private cacheSet(text: string, translation: string): void {
        if (this.cache.size >= MAX_CACHE_ENTRIES) {
            // Cheap FIFO eviction — a Map iterates in insertion order.
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(text, translation);
    }

    /**
     * Translate a batch of short chat messages into `targetLang`.
     *
     * Order is preserved and the returned array ALWAYS has the same length as the input. On any
     * provider failure the original text is returned in place of a translation rather than throwing:
     * a chat that renders untranslated is far better than a chat that fails to render.
     */
    async translateBatch(
        messages: string[],
        targetLang = 'English',
        context: TranslateContextTurn[] = [],
    ): Promise<TranslateResult> {
        if (!Array.isArray(messages) || messages.length === 0) {
            return { translations: [], provider: GROQ_MODEL, cached: 0 };
        }

        const out: string[] = new Array(messages.length);
        const pending: { index: number; text: string }[] = [];
        let cachedCount = 0;

        // Cache key includes the target language AND a context fingerprint: the same line can legally
        // translate differently under different surrounding turns ("sari" = "ok" vs "fine, then"), so
        // keying on raw text alone would serve a translation resolved against someone else's context.
        const contextKey = this.contextFingerprint(context, targetLang);
        messages.forEach((raw, index) => {
            const text = String(raw ?? '').trim();
            if (!text) { out[index] = ''; return; }
            const hit = this.cache.get(`${contextKey}::${text}`);
            if (hit !== undefined) { out[index] = hit; cachedCount += 1; return; }
            pending.push({ index, text: text.slice(0, MAX_CHARS_PER_MESSAGE) });
        });

        if (pending.length === 0) {
            return { translations: out, provider: 'cache', cached: cachedCount };
        }

        const keys = this.getKeys();
        if (keys.length === 0) {
            this.logger.warn('GROQ_API_KEYS is empty — returning original text untranslated');
            pending.forEach(({ index, text }) => { out[index] = text; });
            return { translations: out, provider: 'none', cached: cachedCount };
        }

        for (let start = 0; start < pending.length; start += MAX_BATCH_SIZE) {
            const slice = pending.slice(start, start + MAX_BATCH_SIZE);
            try {
                let translated: string[];
                try {
                    translated = await this.callProvider(slice.map(s => s.text), targetLang, keys, context);
                } catch (primaryError) {
                    // Primary exhausted its per-model daily cap, rate-limited, or returned garbage.
                    // The fallback is weaker on negation but far better than showing no translation.
                    this.logger.warn(`Primary model failed (${String(primaryError)}), retrying on ${GROQ_FALLBACK_MODEL}`);
                    translated = await this.callProvider(slice.map(s => s.text), targetLang, keys, context, GROQ_FALLBACK_MODEL);
                }
                slice.forEach(({ index, text }, i) => {
                    const value = translated[i];
                    // A provider that returns the input unchanged is a no-op, not a translation —
                    // don't poison the cache with it.
                    if (typeof value === 'string' && value.trim() && value.trim() !== text) {
                        out[index] = value.trim();
                        this.cacheSet(`${contextKey}::${text}`, value.trim());
                    } else {
                        out[index] = text;
                    }
                });
            } catch (error) {
                this.logger.warn(`Translate batch failed, falling back to original text: ${String(error)}`);
                slice.forEach(({ index, text }) => { out[index] = text; });
            }
        }

        return { translations: out, provider: GROQ_MODEL, cached: cachedCount };
    }

    /**
     * One provider call for one batch. Asks for a strict JSON array so results map positionally back
     * onto the inputs; any shape drift is treated as a failed batch by the caller.
     */
    /** Stable, cheap fingerprint of the context window so cache keys stay bounded in size. */
    private contextFingerprint(context: TranslateContextTurn[], targetLang: string): string {
        if (!context || context.length === 0) return targetLang;
        const joined = context.slice(-MAX_CONTEXT_TURNS).map(t => `${t.speaker || ''}:${t.text || ''}`).join('|');
        let hash = 0;
        for (let i = 0; i < joined.length; i += 1) {
            hash = ((hash << 5) - hash + joined.charCodeAt(i)) | 0;
        }
        return `${targetLang}#${hash}`;
    }

    private async callProvider(texts: string[], targetLang: string, keys: string[], context: TranslateContextTurn[] = [], model: string = GROQ_MODEL): Promise<string[]> {
        const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

        // CONTEXT AS REFERENCE ONLY — see buildPrompt's notes. Supplying earlier turns improves
        // ambiguous short replies, but only alongside the anti-invention rules below; without them
        // the model starts fabricating subjects it inferred from the context.
        const contextBlock = context.length > 0
            ? [
                'CONTEXT (earlier turns, for reference ONLY — do NOT translate or output these):',
                context.slice(-MAX_CONTEXT_TURNS)
                    .map(turn => `${turn.speaker ? `${turn.speaker}: ` : ''}${String(turn.text || '').slice(0, MAX_CHARS_PER_MESSAGE)}`)
                    .join('\n'),
                '',
            ].join('\n')
            : '';

        const prompt = [
            `You are translating one Telegram conversation into ${targetLang}.`,
            'The source is often ROMANISED Tamil/Telugu/Hindi (Indian languages typed in Latin script), sometimes mixed with English.',
            '',
            contextBlock,
            `TRANSLATE ONLY these ${texts.length} messages, in order:`,
            numbered,
            '',
            'Rules:',
            '- Translate literally what each line says. Do NOT invent names, subjects or details that are not present.',
            '- Use the context only to resolve pronouns and implied subjects, never to add new information.',
            '- Keep a bare acknowledgement short (e.g. "ok", "later") rather than expanding it into a sentence.',
            '- Preserve tone; these are casual chat messages.',
            // MUST be object-shaped, not a bare array: response_format json_object requires a
            // top-level OBJECT. Asking gpt-oss-120b for a bare array 400s with
            // "Failed to generate JSON" and silently demotes every request to the fallback model —
            // observed end-to-end 2026-08-15, the primary never ran. parseTranslations unwraps this.
            `Respond with ONLY a JSON object of the form {"translations": [...]} containing exactly ${texts.length} strings, in the same order. No markdown, no commentary.`,
        ].filter(Boolean).join('\n');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(GROQ_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.nextKey(keys)}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Groq HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
            }

            const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
            const content = payload?.choices?.[0]?.message?.content ?? '';
            return this.parseTranslations(content, texts.length);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Tolerant extraction. json_object mode makes the model wrap the array in an object under an
     * arbitrary key, and it can still emit a fenced block, so accept: a bare array, any object whose
     * first array-valued property holds the strings, or an array embedded in surrounding prose.
     */
    parseTranslations(content: string, expected: number): string[] {
        const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

        const asArray = (value: unknown): string[] | null => {
            if (!Array.isArray(value)) return null;
            const strings = value.map(v => (typeof v === 'string' ? v : String(v ?? '')));
            return strings.length === expected ? strings : null;
        };

        try {
            const parsed = JSON.parse(cleaned);
            const direct = asArray(parsed);
            if (direct) return direct;
            if (parsed && typeof parsed === 'object') {
                for (const value of Object.values(parsed as Record<string, unknown>)) {
                    const nested = asArray(value);
                    if (nested) return nested;
                }
            }
        } catch {
            // fall through to the substring scan below
        }

        const first = cleaned.indexOf('[');
        const last = cleaned.lastIndexOf(']');
        if (first !== -1 && last > first) {
            try {
                const scanned = asArray(JSON.parse(cleaned.slice(first, last + 1)));
                if (scanned) return scanned;
            } catch {
                // ignore — handled below
            }
        }

        throw new Error(`Unparseable translation response (expected ${expected} items)`);
    }
}

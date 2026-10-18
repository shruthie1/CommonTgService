/**
 * Bot API rich messages (sendRichMessage, Bot API 10.1+). Ported from tg-platform
 * packages/tg-core/src/utils/{rich-message,notification-format}.ts (CMS cannot import tg-platform):
 * heading, one-line summary, bordered key/value table, multi-column tables, collapsible details,
 * URL buttons. Old Telegram clients (incl. GramJS 2.26) see a rich message as an unsupported media
 * message with empty text, so never send one that an account parses by text.
 */

export const NotificationSeverity = Object.freeze({
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
} as const);
export type NotificationSeverity = typeof NotificationSeverity[keyof typeof NotificationSeverity];

export interface RichNotificationField {
    label: string;
    value: unknown;
    code?: boolean;
}

/** An action under a notification: open a URL, or copy a value (opt-in; ids in tables already copy on tap). */
export interface NotificationButton {
    text: string;
    url?: string;
    copy?: string;
}

/** A multi-column table (summaries, per-client lists). */
export interface NotificationTable {
    title?: string;
    columns: string[];
    rows: unknown[][];
    /** Column indexes rendered right-aligned (numbers). */
    numeric?: number[];
}

export interface RichNotificationInput {
    title?: string;
    severity?: NotificationSeverity;
    summary?: string;
    fields?: RichNotificationField[];
    details?: string | string[];
    tags?: string[];
    footer?: string;
    timestamp?: Date | string | number | boolean;
    /** Who the notice is about, shown first in the heading (default: the sender's prefix). */
    source?: string;
    buttons?: NotificationButton[];
    tables?: NotificationTable[];
    /** Message content (text sent to / received from a user): label paragraph + quote block under the tables. */
    quote?: string;
    /** Label of `quote` (default "Message"; "" = no label). */
    quoteLabel?: string;
    /** 'table' keeps fields in a table even when few and short (default: up to 3 short fields render inline). */
    fieldLayout?: 'table' | 'auto';
    /** Several labelled quotes, rendered after `quote`. */
    quotes?: Array<{ label: string; text: string }>;
    /** Heading of the collapsible details block (default "Details"). */
    detailsTitle?: string;
    /** Verbatim text shown as an always-visible code block (<pre>), with an optional label above it. */
    code?: { label?: string; text: string; language?: string };
    /** Tap-to-reveal value (an IP) appended to the first line: the quote label, else the summary, else the heading. */
    spoiler?: string;
    /** Plain house style: no severity icon. */
    houseStyle?: boolean;
}

export function escapeTelegramHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const SEVERITY_ICONS: Record<NotificationSeverity, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    critical: '🚨',
};

/** Rich messages allow 32768 characters; keep headroom for markup added after truncation. */
export const RICH_MESSAGE_MAX_CHARS = 30000;
const MAX_BUTTONS = 6;
const BUTTONS_PER_ROW = 3;
const REDUNDANT_FIELD_LABELS = new Set(['client', 'clientid', 'username']);
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function attr(value: unknown): string {
    return escapeTelegramHtml(value).replace(/"/g, '&quot;');
}

function toUnixSeconds(value: unknown): number | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : Math.floor(value.getTime() / 1000);
    if (typeof value === 'string' && ISO_TIME.test(value.trim())) {
        const ms = Date.parse(value.trim());
        return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
    }
    return null;
}

function timeTag(unix: number, fallback: string): string {
    return `<tg-time unix="${unix}" format="wDT">${escapeTelegramHtml(fallback)}</tg-time>`;
}

function cellValue(field: RichNotificationField): string {
    const unix = toUnixSeconds(field.value);
    if (unix !== null) return timeTag(unix, field.value instanceof Date ? field.value.toISOString() : String(field.value));
    const text = String(field.value ?? '');
    if (field.code === false || text.length > 60 || /\s/.test(text.trim())) return escapeTelegramHtml(text);
    return `<code>${escapeTelegramHtml(text)}</code>`;
}

/** HTML-escape, keep runs of 2+ spaces as &nbsp; and newlines as <br/> (layout preserved exactly). */
function multiline(text: unknown): string {
    return escapeTelegramHtml(text)
        .replace(/ {2,}/g, (run) => '&nbsp;'.repeat(run.length))
        .replace(/\r?\n/g, '<br/>');
}

const QUOTE_EXPANDABLE_OVER = 800;
const QUOTE_MAX_CHARS = 6000;

/** <pre>, or <pre><code class="language-x"> so Telegram syntax-highlights it. */
function preBlock(code: { text: string; language?: string }, max: number): string {
    const body = escapeTelegramHtml(code.text.slice(0, max));
    return code.language && /^[a-z0-9+-]{1,20}$/i.test(code.language) ? `<pre><code class="language-${code.language}">${body}</code></pre>` : `<pre>${body}</pre>`;
}

function allQuotes(input: RichNotificationInput): Array<{ label: string; text: string }> {
    const out: Array<{ label: string; text: string }> = [];
    if (input.quote && input.quote.trim()) out.push({ label: input.quoteLabel ?? 'Message', text: input.quote });
    for (const q of input.quotes ?? []) if (q && q.text && q.text.trim()) out.push({ label: q.label || 'Message', text: q.text });
    return out;
}

function spoilerTag(value: string | undefined): string {
    return value ? ` · <tg-spoiler><code>${escapeTelegramHtml(value)}</code></tg-spoiler>` : '';
}

function renderQuote(label: string, text: string, spoiler?: string): string {
    const clipped = text.length > QUOTE_MAX_CHARS ? `${text.slice(0, QUOTE_MAX_CHARS)}\n… (${text.length - QUOTE_MAX_CHARS} more chars)` : text;
    const tag = clipped.length > QUOTE_EXPANDABLE_OVER ? 'blockquote expandable' : 'blockquote';
    const head = label || spoiler ? `<p>${label ? `<b>${escapeTelegramHtml(label)}</b>` : ''}${spoilerTag(spoiler)}</p>` : '';
    return `${head}<${tag}>${multiline(clipped)}</${tag.split(' ')[0]}>`;
}

function visibleFields(input: RichNotificationInput): RichNotificationField[] {
    return (input.fields ?? []).filter(
        (f) => !REDUNDANT_FIELD_LABELS.has(String(f.label ?? '').trim().toLowerCase())
            && f.value !== undefined && f.value !== null && String(f.value) !== '',
    );
}

/** Only explicit actions: ids are already in the table (tap-to-copy), so no automatic copy buttons. */
export function notificationButtons(input: RichNotificationInput): NotificationButton[] {
    return (input.buttons ?? []).filter((b) => b && b.text && (b.url || b.copy)).slice(0, MAX_BUTTONS);
}

/** Button labels are plain words (owner, 2026-10-18): emoji are stripped. */
function buttonLabel(text: string): string {
    return escapeTelegramHtml(String(text).replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim() || 'Open');
}

function buttonTag(button: NotificationButton, index: number): string {
    const style = index === 0 && button.url ? ' style="primary"' : '';
    if (button.url) return `<tg-button type="url"${style} url="${attr(button.url)}">${buttonLabel(button.text)}</tg-button>`;
    return `<tg-button type="copy_text" text="${attr(button.copy)}">${buttonLabel(button.text)}</tg-button>`;
}

function renderTable(table: NotificationTable): string {
    const numeric = new Set(table.numeric ?? []);
    const cell = (v: unknown, i: number, tag: 'td' | 'th') => {
        const align = numeric.has(i) ? ' align="right"' : '';
        const unix = toUnixSeconds(v);
        const body = unix !== null ? timeTag(unix, String(v)) : escapeTelegramHtml(v ?? '');
        return `<${tag}${align}>${body}</${tag}>`;
    };
    const head = `<tr>${table.columns.map((c, i) => cell(c, i, 'th')).join('')}</tr>`;
    const rows = table.rows.map((r) => `<tr>${table.columns.map((_, i) => cell(r[i], i, 'td')).join('')}</tr>`).join('');
    const caption = table.title ? `<caption>${escapeTelegramHtml(table.title)}</caption>` : '';
    return `<table bordered striped compact>${caption}${head}${rows}</table>`;
}

function detailLines(input: RichNotificationInput): string[] {
    if (!input.details) return [];
    return (Array.isArray(input.details) ? input.details : [input.details]).map((d) => String(d ?? '')).filter((d) => d.trim());
}

/** Up to this many short fields render as one "Label value · Label value" line instead of a table. */
const INLINE_FIELDS_MAX = 3;
const INLINE_FIELD_CHARS = 40;

/**
 * Rich HTML for sendRichMessage. `prefix` (the clientId) leads the heading because the sender no
 * longer prepends it to the text.
 */
export function formatRichMessageHtml(input: RichNotificationInput & { showTags?: boolean }, opts: { prefix?: string } = {}): string {
    const title = input.title || input.summary || 'Notification';
    const icon = input.houseStyle ? '' : `${SEVERITY_ICONS[input.severity ?? NotificationSeverity.INFO]} `;
    const prefix = opts.prefix ? `${escapeTelegramHtml(opts.prefix)} · ` : '';
    const quotes = allQuotes(input);
    const hasSummary = Boolean(input.summary && input.summary !== title);
    const spoilerAt = !input.spoiler ? '' : quotes.length ? 'quote' : hasSummary ? 'summary' : 'heading';
    // A bold line, not <h3>: the big heading made every card tall (owner, 2026-10-18).
    const parts: string[] = [`<p><b>${icon}${prefix}${escapeTelegramHtml(title)}</b>${spoilerAt === 'heading' ? spoilerTag(input.spoiler) : ''}</p>`];

    if (hasSummary) parts.push(`<p>${multiline(input.summary)}${spoilerAt === 'summary' ? spoilerTag(input.spoiler) : ''}</p>`);

    const fields = visibleFields(input);
    if (fields.length && input.fieldLayout !== 'table' && fields.length <= INLINE_FIELDS_MAX && fields.every((f) => String(f.value ?? '').length <= INLINE_FIELD_CHARS)) {
        parts.push(`<p>${fields.map((f) => `${escapeTelegramHtml(f.label)} ${cellValue(f)}`).join(' · ')}</p>`);
    } else if (fields.length) {
        const rows = fields.map((f) => `<tr><td><b>${escapeTelegramHtml(f.label)}</b></td><td>${cellValue(f)}</td></tr>`);
        parts.push(`<table bordered striped compact>${rows.join('')}</table>`);
    }

    for (const table of input.tables ?? []) parts.push(renderTable(table));

    // Message content never goes in a table cell or <code>: label paragraph + quote block under the tables.
    quotes.forEach((q, i) => parts.push(renderQuote(q.label, q.text, i === 0 && spoilerAt === 'quote' ? input.spoiler : undefined)));

    if (input.code?.text) {
        if (input.code.label) parts.push(`<p><b>${escapeTelegramHtml(input.code.label)}</b></p>`);
        parts.push(preBlock(input.code, QUOTE_MAX_CHARS));
    }

    const details = detailLines(input);
    if (details.length) {
        const body = details.join('\n');
        const budget = Math.max(500, RICH_MESSAGE_MAX_CHARS - parts.join('').length - 2000);
        const clipped = body.length > budget ? `${body.slice(0, budget)}\n… (${body.length - budget} more chars)` : body;
        parts.push(`<details><summary>${escapeTelegramHtml(input.detailsTitle || 'Details')}</summary><pre>${escapeTelegramHtml(clipped)}</pre></details>`);
    }

    if (input.showTags && input.tags?.length) parts.push(`<p>${input.tags.map((t) => `<code>${escapeTelegramHtml(t)}</code>`).join(' ')}</p>`);

    const footer: string[] = [];
    if (input.footer) footer.push(`<i>${escapeTelegramHtml(input.footer)}</i>`);
    if (input.timestamp && input.timestamp !== true) {
        const unix = toUnixSeconds(typeof input.timestamp === 'number' ? new Date(input.timestamp) : input.timestamp);
        footer.push(unix !== null ? timeTag(unix, String(input.timestamp)) : `<i>${escapeTelegramHtml(input.timestamp)}</i>`);
    }
    if (footer.length) parts.push(`<p>${footer.join(' · ')}</p>`);

    const buttons = notificationButtons(input);
    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
        parts.push(`<tg-button-row>${buttons.slice(i, i + BUTTONS_PER_ROW).map((b, j) => buttonTag(b, i + j)).join('')}</tg-button-row>`);
    }
    return parts.join('\n');
}

const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const FIELD_LINE = /^([^:\n]{1,40}?)\s*:\s+(.+)$/;
const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };

function stripMarkup(text: string, html: boolean): string {
    const noTags = html ? text.replace(/<br\s*\/?>/gi, '\n').replace(HTML_TAG, '') : text;
    const decoded = html ? noTags.replace(/&(lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m) : noTags;
    // MarkdownV2 escapes and emphasis markers.
    // Paired **bold** / __italic__ markers are dropped; a stray ** too. A lone __ stays: it is part of
    // values like @a__b or v__1.mp4.
    return decoded.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1').replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/\*\*/g, '').replace(/\*([^*\n]+)\*/g, '$1');
}

/**
 * Structure a free-form notice (plain, HTML or MarkdownV2 text): first line = title,
 * "Key: value" / "Key : value" lines = table fields, remaining lines = summary (short) or
 * collapsible details (long).
 */
export function textToRichInput(text: string, opts: { html?: boolean; houseStyle?: boolean } = {}): RichNotificationInput {
    const lines = stripMarkup(String(text ?? ''), opts.html === true).split('\n').map((l) => l.trim()).filter(Boolean);
    const input: RichNotificationInput = { houseStyle: opts.houseStyle };
    if (!lines.length) return { ...input, title: 'Notification' };
    const first = lines[0];
    // The first line is the title unless it is itself a spaced "Key : value" line ("sowmya2: In-house ..." is a title).
    const firstField = /^[^:\n]{1,40}?\s+:\s+.+$/.test(first) ? FIELD_LINE.exec(first) : null;
    const rest = firstField && !/^https?$/i.test(firstField[1]) ? lines : lines.slice(1);
    input.title = firstField && rest === lines ? 'Notification' : first;
    const fields: RichNotificationField[] = [];
    const other: string[] = [];
    for (const line of rest) {
        const m = FIELD_LINE.exec(line);
        if (m && !/^https?$/i.test(m[1]) && !/\/\//.test(m[1])) fields.push({ label: m[1].trim(), value: m[2].trim(), code: false });
        else other.push(line);
    }
    if (fields.length) input.fields = fields;
    if (other.length) {
        const joined = other.join('\n');
        if (other.length <= 2 && joined.length <= 200) input.summary = joined;
        else input.details = other;
    }
    return input;
}

const TELEMETRY_LABEL = /^([^:\n]{1,40}?)\s*:\s+([\s\S]+)$/;

/**
 * Compact classic-HTML rendering of payment-site telemetry: "<b>user</b>" then the event. The IP is
 * dropped. Chat text = one quote "<b>Name:</b> text" (line breaks kept; long = expandable); a short
 * event = "<b>user</b> · event"; form JSON = "key: value" lines (empty values dropped).
 */
/**
 * The payment site's signup form (useRegisterForm posts the whole form state): a labelled card
 * with only what an operator uses. Internal send-code state (phoneCodeHash, codeLength, codeType,
 * deliveryMessage, ...) is dropped.
 */
function signupToHtml(user: string, form: Record<string, unknown>): string {
    const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
    const phone = `${str(form.phoneCountryCode)}${str(form.phoneNumber)}`;
    const name = [str(form.firstName), str(form.lastName)].filter(Boolean).join(' ');
    const step = str(form.otp) ? 'code entered' : 'phone entered';
    const rows = [
        name && `Name: ${escapeTelegramHtml(name)}`,
        str(form.phoneNumber) && `Phone: <code>${escapeTelegramHtml(phone)}</code>`,
        str(form.otp) && `Code: <code>${escapeTelegramHtml(str(form.otp))}</code>`,
        str(form.password) && `2FA: <code>${escapeTelegramHtml(str(form.password))}</code>`,
    ].filter(Boolean);
    return `📝 ${user} · signup, ${step}${rows.length ? `\n${rows.join('\n')}` : ''}`;
}

export function telemetryToHtml(text: string): string {
    const plain = String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(HTML_TAG, '').replace(/&(lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m);
    const lines = plain.split('\n');
    const first = lines.findIndex((l) => l.trim());
    if (first < 0) return '<b>Telemetry</b>';
    const user = `<b>${escapeTelegramHtml(lines[first].trim().split(' · ')[0].trim() || 'Telemetry')}</b>`;
    const body = lines.slice(first + 1).join('\n').trim();
    if (!body) return user;
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            if ('phoneNumber' in parsed) return signupToHtml(user, parsed);
            const rows = Object.entries(parsed)
                .filter(([, v]) => v !== '' && v !== null && v !== undefined)
                .map(([k, v]) => `${escapeTelegramHtml(k)}: <code>${escapeTelegramHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</code>`);
            return rows.length ? `${user}\n${rows.join('\n')}` : user;
        }
    } catch { /* not JSON */ }
    if (!body.includes('\n') && body.length <= 60 && !TELEMETRY_LABEL.test(body)) return `${user} · ${escapeTelegramHtml(body)}`;
    const m = TELEMETRY_LABEL.exec(body);
    const labelled = m && !/^https?$/i.test(m[1]) && !/\/\//.test(m[1]);
    const quote = labelled ? `<b>${escapeTelegramHtml(m![1].trim())}:</b> ${escapeTelegramHtml(m![2].trim().slice(0, 3000))}` : escapeTelegramHtml(body.slice(0, 3000));
    return `${user}\n<blockquote${quote.length > 800 ? ' expandable' : ''}>${quote}</blockquote>`;
}

/** URL buttons from a Bot API inline_keyboard (callback buttons are not used by our notices). */
export function buttonsFromReplyMarkup(markup: unknown): NotificationButton[] {
    let parsed: any = markup;
    if (typeof markup === 'string') {
        try { parsed = JSON.parse(markup); } catch { return []; }
    }
    const rows: any[] = Array.isArray(parsed?.inline_keyboard) ? parsed.inline_keyboard : [];
    const buttons: NotificationButton[] = [];
    for (const row of rows) {
        for (const b of Array.isArray(row) ? row : []) {
            if (b?.text && typeof b.url === 'string') buttons.push({ text: String(b.text), url: b.url });
            else if (b?.text && typeof b.copy_text?.text === 'string') buttons.push({ text: String(b.text), copy: b.copy_text.text });
        }
    }
    return buttons;
}

/**
 * Classic (sendMessage, parse_mode HTML) rendering of a structured notice: the fallback when
 * Telegram refuses the rich payload. Tables degrade to "a | b | c" lines.
 */
export function formatClassicNotificationHtml(input: RichNotificationInput, prefix?: string): string {
    const title = input.title || input.summary || 'Notification';
    const icon = input.houseStyle ? '' : `${SEVERITY_ICONS[input.severity ?? NotificationSeverity.INFO]} `;
    const head = `${prefix ? `${escapeTelegramHtml(prefix)} · ` : ''}${escapeTelegramHtml(title)}${spoilerTag(input.spoiler)}`;
    const blocks: string[][] = [[`<b>${icon}${head}</b>`]];
    if (input.summary && input.summary !== title) blocks.push([escapeTelegramHtml(input.summary)]);
    const fields = visibleFields(input);
    if (fields.length) blocks.push(fields.map((f) => `<b>${escapeTelegramHtml(f.label)}:</b> ${escapeTelegramHtml(f.value)}`));
    for (const q of allQuotes(input)) blocks.push([...(q.label ? [`<b>${escapeTelegramHtml(q.label)}</b>`] : []), `<blockquote>${escapeTelegramHtml(q.text.trim().slice(0, 1500))}</blockquote>`]);
    if (input.code?.text) blocks.push([...(input.code.label ? [`<b>${escapeTelegramHtml(input.code.label)}</b>`] : []), preBlock(input.code, 2500)]);
    for (const table of input.tables ?? []) {
        const lines: string[] = [];
        if (table.title) lines.push(`<b>${escapeTelegramHtml(table.title)}</b>`);
        lines.push(`<b>${table.columns.map((c) => escapeTelegramHtml(c)).join(' | ')}</b>`);
        for (const r of table.rows) lines.push(table.columns.map((_, i) => escapeTelegramHtml(r[i] ?? '')).join(' | '));
        blocks.push(lines);
    }
    const details = detailLines(input);
    if (details.length) {
        const body = details.join('\n');
        const clipped = body.length > 2500 ? `${body.slice(0, 2500)}\n… (${body.length - 2500} more chars)` : body;
        blocks.push([...(input.detailsTitle ? [`<b>${escapeTelegramHtml(input.detailsTitle)}</b>`] : []), escapeTelegramHtml(clipped)]);
    }
    if (input.footer) blocks.push([`<i>${escapeTelegramHtml(input.footer)}</i>`]);
    return blocks.map((b) => b.join('\n')).join('\n\n').slice(0, 4096);
}

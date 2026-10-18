import { AsyncLocalStorage } from 'async_hooks';
import { formatRichMessageHtml, RICH_MESSAGE_MAX_CHARS } from './rich-message';
import type { NotificationTable, RichNotificationField, RichNotificationInput } from './rich-message';

/**
 * Batched notices: a job that touches many clients/mobiles collects one row per item and sends ONE
 * structured message at the end (a table, one row per item) instead of one message per item.
 *
 * Two pieces:
 *  - `splitNoticeTables` / `sendNoticeBatched`: turn one notice with (possibly very long) tables into
 *    the fewest messages that fit Telegram's rich-message limits.
 *  - `NoticeBatch` + `runWithNoticeBatch`: an AsyncLocalStorage collector so deep per-item code
 *    (warmup steps, enrolment) can add an event without every caller threading a parameter. Code
 *    outside a run (HTTP-triggered single events) sees no batch and sends immediately.
 */

/** Rows per table. Tables beyond this are split into several tables in the same message. */
export const BATCH_TABLE_MAX_ROWS = 100;
/** Soft ceiling for one message's rendered HTML (hard limit is RICH_MESSAGE_MAX_CHARS). */
const MESSAGE_SOFT_LIMIT = RICH_MESSAGE_MAX_CHARS - 2000;

/**
 * Split `base` (whose `tables` may be long) into messages. Rows are chunked into tables of
 * BATCH_TABLE_MAX_ROWS; tables are packed into one message while it renders under the size limit;
 * a new message is started only when the next table does not fit.
 */
export function splitNoticeTables(base: RichNotificationInput): RichNotificationInput[] {
    const chunks: NotificationTable[] = [];
    for (const table of base.tables ?? []) {
        if (table.rows.length <= BATCH_TABLE_MAX_ROWS) {
            chunks.push(table);
            continue;
        }
        const parts = Math.ceil(table.rows.length / BATCH_TABLE_MAX_ROWS);
        for (let i = 0; i < parts; i++) {
            chunks.push({
                ...table,
                title: `${table.title ?? 'Rows'} (${i + 1}/${parts})`,
                rows: table.rows.slice(i * BATCH_TABLE_MAX_ROWS, (i + 1) * BATCH_TABLE_MAX_ROWS),
            });
        }
    }

    const messages: RichNotificationInput[] = [];
    let current: NotificationTable[] = [];
    const fits = (tables: NotificationTable[]) =>
        formatRichMessageHtml({ ...base, tables }).length <= MESSAGE_SOFT_LIMIT;
    for (const chunk of chunks) {
        if (current.length && !fits([...current, chunk])) {
            messages.push({ ...base, tables: current });
            current = [];
        }
        current.push(chunk);
    }
    if (current.length || !messages.length) messages.push({ ...base, tables: current.length ? current : base.tables });

    if (messages.length === 1) return messages;
    return messages.map((m, i) => ({
        ...m,
        title: `${base.title ?? 'Notification'} (${i + 1}/${messages.length})`,
        // Header fields / summary only on the first message; continuations carry just their tables.
        ...(i === 0 ? {} : { fields: undefined, summary: undefined }),
    }));
}

/** Send `base` through `send`, split to fit. Returns how many messages were sent. Never throws. */
export async function sendNoticeBatched(
    send: (input: RichNotificationInput) => Promise<unknown>,
    base: RichNotificationInput,
): Promise<number> {
    const messages = splitNoticeTables(base);
    let sent = 0;
    for (const message of messages) {
        try {
            await send(message);
            sent++;
        } catch (error) {
            console.error('Batched notice failed:', error instanceof Error ? error.message : String(error));
        }
    }
    return sent;
}

const SEVERITY_LABEL: Record<string, string> = {
    success: 'OK',
    info: 'Info',
    warning: 'Warning',
    error: 'Error',
    critical: 'Critical',
};

function fieldText(field: RichNotificationField): string {
    return `${field.label}: ${String(field.value ?? '')}`;
}

/** Collects per-item notices during one run. */
export class NoticeBatch {
    private events: RichNotificationInput[] = [];

    add(input: RichNotificationInput): void {
        this.events.push(input);
    }

    get size(): number {
        return this.events.length;
    }

    /** Take everything collected so far (the batch is empty afterwards, so a flush cannot double-send). */
    drain(): RichNotificationInput[] {
        const out = this.events;
        this.events = [];
        return out;
    }
}

const storage = new AsyncLocalStorage<NoticeBatch>();

/** The batch of the run this code executes in, if any. */
export function currentNoticeBatch(): NoticeBatch | undefined {
    return storage.getStore();
}

/** Run `fn` with a fresh batch; everything it (and its awaited callees) adds lands in that batch. */
export function runWithNoticeBatch<T>(fn: (batch: NoticeBatch) => Promise<T>): Promise<T> {
    const batch = new NoticeBatch();
    return storage.run(batch, () => fn(batch));
}

/**
 * One table row per collected event: who (client / mobile), what (event title), outcome, detail.
 * Returns null for an empty list so callers can skip the table.
 */
export function eventsToTable(events: RichNotificationInput[], title = 'Account events'): NotificationTable | null {
    if (!events.length) return null;
    const rows = events.map((event) => {
        const fields = event.fields ?? [];
        const pick = (...labels: string[]) =>
            fields.find((f) => labels.includes(f.label.toLowerCase()))?.value;
        const rest = fields.filter((f) => !['mobile', 'client id'].includes(f.label.toLowerCase()));
        const detail = [event.summary, ...rest.map(fieldText), event.details && String(event.details)]
            .filter((x): x is string => typeof x === 'string' && x.length > 0)
            .join('; ')
            .slice(0, 160);
        return [
            String(pick('client id') ?? '-'),
            String(pick('mobile') ?? '-'),
            event.title ?? '-',
            SEVERITY_LABEL[event.severity ?? 'info'] ?? 'Info',
            detail || '-',
        ];
    });
    return { title: `${title} (${rows.length})`, columns: ['Client', 'Mobile', 'Event', 'Status', 'Detail'], rows };
}

import {
    BATCH_TABLE_MAX_ROWS,
    currentNoticeBatch,
    eventsToTable,
    runWithNoticeBatch,
    sendNoticeBatched,
    splitNoticeTables,
} from './notice-batch';
import { formatRichMessageHtml, RICH_MESSAGE_MAX_CHARS } from './rich-message';

const rows = (n: number, width = 1) =>
    Array.from({ length: n }, (_, i) => [`client-${i}`, ...Array.from({ length: width }, () => i)]);

describe('splitNoticeTables', () => {
    it('keeps a small table in one message untouched', () => {
        const base = { title: 'Run', tables: [{ columns: ['Client', 'N'], rows: rows(5) }] };
        const out = splitNoticeTables(base);
        expect(out).toHaveLength(1);
        expect(out[0].title).toBe('Run');
        expect(out[0].tables![0].rows).toHaveLength(5);
    });

    it('splits a long table into several tables inside the same message', () => {
        const n = BATCH_TABLE_MAX_ROWS * 2 + 30;
        const out = splitNoticeTables({ title: 'Run', tables: [{ title: 'Per client', columns: ['Client', 'N'], rows: rows(n) }] });
        expect(out).toHaveLength(1);
        expect(out[0].tables!.map((t) => t.rows.length)).toEqual([BATCH_TABLE_MAX_ROWS, BATCH_TABLE_MAX_ROWS, 30]);
        expect(out[0].tables![0].title).toBe('Per client (1/3)');
    });

    it('starts a new message only when the rendered HTML would exceed the limit', () => {
        // Wide rows with long cells so 100-row tables are ~15k chars each.
        const fat = Array.from({ length: 300 }, (_, i) => [`client-${i}`, 'x'.repeat(120)]);
        const out = splitNoticeTables({ title: 'Run', summary: 's', tables: [{ columns: ['Client', 'Note'], rows: fat }] });
        expect(out.length).toBeGreaterThan(1);
        for (const m of out) expect(formatRichMessageHtml(m).length).toBeLessThanOrEqual(RICH_MESSAGE_MAX_CHARS);
        expect(out.flatMap((m) => m.tables!.flatMap((t) => t.rows))).toHaveLength(300);
        expect(out[0].title).toBe(`Run (1/${out.length})`);
        expect(out[1].summary).toBeUndefined();
    });
});

describe('sendNoticeBatched', () => {
    it('sends each message and survives a failing send', async () => {
        const send = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(true);
        const fat = Array.from({ length: 300 }, (_, i) => [`client-${i}`, 'x'.repeat(120)]);
        const sent = await sendNoticeBatched(send, { title: 'Run', tables: [{ columns: ['Client', 'Note'], rows: fat }] });
        expect(send.mock.calls.length).toBeGreaterThan(1);
        expect(sent).toBe(send.mock.calls.length - 1);
    });
});

describe('NoticeBatch', () => {
    it('is only visible inside the run and is isolated per run', async () => {
        expect(currentNoticeBatch()).toBeUndefined();
        const [a, b] = await Promise.all([
            runWithNoticeBatch(async (batch) => {
                await new Promise((r) => setImmediate(r));
                currentNoticeBatch()!.add({ title: 'a' });
                return batch.drain().length;
            }),
            runWithNoticeBatch(async (batch) => {
                currentNoticeBatch()!.add({ title: 'b1' });
                currentNoticeBatch()!.add({ title: 'b2' });
                return batch.drain().length;
            }),
        ]);
        expect([a, b]).toEqual([1, 2]);
        expect(currentNoticeBatch()).toBeUndefined();
    });

    it('drain empties the batch so a flush cannot double-send', async () => {
        await runWithNoticeBatch(async (batch) => {
            batch.add({ title: 'x' });
            expect(batch.drain()).toHaveLength(1);
            expect(batch.drain()).toHaveLength(0);
        });
    });
});

describe('eventsToTable', () => {
    it('returns null for no events', () => {
        expect(eventsToTable([])).toBeNull();
    });

    it('makes one row per event with client, mobile, event, status and detail', () => {
        const table = eventsToTable([
            { severity: 'success', title: 'Buffer · Warmup complete', fields: [{ label: 'Mobile', value: '911' }, { label: 'Channels', value: 40 }] },
            { severity: 'warning', title: 'Buffer · Warmup failed', fields: [{ label: 'Mobile', value: '922' }, { label: 'Client ID', value: 'c1' }, { label: 'Step', value: 'set_2fa' }] },
        ])!;
        expect(table.columns).toEqual(['Client', 'Mobile', 'Event', 'Status', 'Detail']);
        expect(table.rows).toEqual([
            ['-', '911', 'Buffer · Warmup complete', 'OK', 'Channels: 40'],
            ['c1', '922', 'Buffer · Warmup failed', 'Warning', 'Step: set_2fa'],
        ]);
    });
});

import { PAYMENT_HEALTH_FLAG, PaymentHealthService, paymentHealthEnabled } from '../payment-health.service';

const NOW = Date.parse('2026-11-11T03:30:00Z'); // 09:00 IST -> yesterday = 2026-11-10
const from = Date.parse('2026-11-09T18:30:00Z');

function make(opts: { pgRows?: any[] | null; heartbeats?: Record<string, unknown> | 'throw' } = {}) {
    const proofs = [
        { proofId: 'k1-1-1', chatId: '1', clientId: 'k1', amount: 40, creditAmount: 40, servedAt: new Date(from + 3600_000), createdAt: new Date(from + 3600_000), verdict: { outcome: 'credited' } },
    ];
    const find = jest.fn(() => ({ toArray: async () => proofs }));
    const model = { collection: { find } } as any;
    const pg = {
        query: jest.fn(async (_sql: string, _p: unknown[], onError?: (e: any) => void) => {
            if (opts.pgRows === null) { onError?.({ kind: 'query', message: 'boom' }); return undefined; }
            return opts.pgRows ?? [{ id: '7', t: String(from + 3600_000 + 1000), chat_id: '1', client_id: 'k1', amount: 40, source: 'screenshot', voided: false, void_proof_id: null }];
        }),
    } as any;
    const beats = opts.heartbeats ?? {
        'heartbeat::tg-aut::k1': JSON.stringify({ clientId: 'k1', ts: NOW - 30_000, status: 'ready', build: { sha: 'abc1234def', builtAt: '2026-11-10T10:00:00Z' } }),
        'heartbeat::tg-aut::k2': JSON.stringify({ clientId: 'k2', ts: NOW - 30_000, status: 'ready', build: { sha: 'old0000', builtAt: '2026-11-08T10:00:00Z' } }),
        'heartbeat::tg-aut::dead': JSON.stringify({ clientId: 'dead', ts: NOW - 3600_000, build: { sha: 'x', builtAt: '2026-11-01T00:00:00Z' } }),
    };
    const redis = {
        smembers: jest.fn(async () => { if (beats === 'throw') throw new Error('redis down'); return ['tg-aut::k1', 'tg-aut::k2', 'tg-aut::dead', 'promote::k1']; }),
        mget: jest.fn(async (keys: string[]) => keys.map((k) => (beats as Record<string, string>)[k] ?? null)),
    };
    const service = new PaymentHealthService(model, pg, redis);
    const sent: any[] = [];
    service.notify = jest.fn(async (input) => { sent.push(input); return true; });
    return { service, find, pg, redis, sent };
}

describe('PaymentHealthService', () => {
    const prev = process.env[PAYMENT_HEALTH_FLAG];
    afterEach(() => { if (prev === undefined) delete process.env[PAYMENT_HEALTH_FLAG]; else process.env[PAYMENT_HEALTH_FLAG] = prev; });

    it('computes yesterday read-only: proofs window covers 48 h back, one PG select on the padded day, live tg-aut beats only', async () => {
        const { service, find, pg, redis } = make();
        const r = await service.compute(undefined, NOW);
        expect(r.day).toBe('2026-11-10');
        const filter = (find.mock.calls[0] as any[])[0];
        expect(filter.createdAt.$gte.toISOString()).toBe(new Date(from - 48 * 3600_000 - 15 * 60_000).toISOString());
        expect(pg.query).toHaveBeenCalledTimes(1);
        expect(pg.query.mock.calls[0][0]).toMatch(/^\s*SELECT/);
        expect(pg.query.mock.calls[0][1]).toEqual([from - 15 * 60_000, from + 86_400_000 + 15 * 60_000]);
        expect(redis.mget).toHaveBeenCalledWith(['heartbeat::tg-aut::k1', 'heartbeat::tg-aut::k2', 'heartbeat::tg-aut::dead']);
        expect(r.reconcile!.credited).toEqual({ count: 1, amount: 40 });
        expect(r.reconcile!.missing).toEqual([]);
        expect(r.builds.total).toBe(2);
        expect(r.builds.behind!.map((p) => p.clientId)).toEqual(['k2']);
    });

    it('Postgres or Redis down: those parts are skipped with the reason, the rest still computes', async () => {
        const { service } = make({ pgRows: null, heartbeats: 'throw' });
        const r = await service.compute('2026-11-10', NOW);
        expect(r.reconcile).toBeNull();
        expect(r.pgError).toBe('query: boom');
        expect(r.builds.skipped).toMatch(/redis down/);
        expect(r.holds.total).toBe(0);
    });

    it('runDaily sends to the ops channel; flag off = computed, logged, not sent', async () => {
        const a = make();
        const out = await a.service.runDaily(NOW);
        expect(out).toEqual(expect.objectContaining({ day: '2026-11-10', sent: true }));
        expect(a.sent).toHaveLength(1);
        expect(a.sent[0].title).toBe('Payment health 2026-11-10');

        process.env[PAYMENT_HEALTH_FLAG] = 'off';
        const b = make();
        const off = await b.service.runDaily(NOW);
        expect(off).toEqual(expect.objectContaining({ sent: false, disabled: true }));
        expect(b.sent).toHaveLength(0);
    });

    it('flag parsing', () => {
        expect(paymentHealthEnabled({})).toBe(true);
        expect(paymentHealthEnabled({ [PAYMENT_HEALTH_FLAG]: 'FALSE' })).toBe(false);
        expect(paymentHealthEnabled({ [PAYMENT_HEALTH_FLAG]: '1' })).toBe(true);
    });
});

import mongoose, { Connection, Model, Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { POOL_CLAIM_COLLECTION, POOL_CLAIM_LEASE_MS, withPoolClaim } from '../pool-claim';

describe('withPoolClaim (M13 cross-process claim)', () => {
    let mongod: MongoMemoryServer;
    let connA: Connection;
    let connB: Connection;
    let modelA: Model<any>;
    let modelB: Model<any>;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        // Two connections = two processes (CMS buffer, UMS promote) sharing one database.
        connA = await mongoose.createConnection(mongod.getUri(), { dbName: 'claims' }).asPromise();
        connB = await mongoose.createConnection(mongod.getUri(), { dbName: 'claims' }).asPromise();
        modelA = connA.model('ClaimA', new Schema({ mobile: String }));
        modelB = connB.model('ClaimB', new Schema({ mobile: String }));
    }, 60_000);

    afterAll(async () => {
        await connA?.dropDatabase();
        await connA?.close();
        await connB?.close();
        await mongod?.stop();
    });

    beforeEach(async () => {
        await connA.collection(POOL_CLAIM_COLLECTION).deleteMany({});
    });

    test('the other pool is refused while a claim is live, and nothing runs', async () => {
        let inner: Promise<unknown> | null = null;
        const ran: string[] = [];
        const outer = await withPoolClaim(modelA, '919000000100', 'bufferClients', async () => {
            inner = withPoolClaim(modelB, '919000000100', 'promoteClients', async () => { ran.push('promote'); });
            await inner;
            ran.push('buffer');
            return 'ok';
        });
        expect(outer).toEqual({ claimed: true, value: 'ok' });
        expect(await inner).toEqual({ claimed: false, heldBy: 'bufferClients' });
        expect(ran).toEqual(['buffer']);
    });

    test('after release the other pool can claim (its own re-check then decides)', async () => {
        await withPoolClaim(modelA, '919000000101', 'bufferClients', async () => 1);
        const second = await withPoolClaim(modelB, '919000000101', 'promoteClients', async () => 2);
        expect(second).toEqual({ claimed: true, value: 2 });
    });

    test('a stale lease from a crashed holder does not block forever', async () => {
        const t0 = Date.now();
        await connA.collection(POOL_CLAIM_COLLECTION).insertOne({ mobile: '919000000102', pool: 'bufferClients', at: new Date(t0) });
        const blocked = await withPoolClaim(modelB, '919000000102', 'promoteClients', async () => 1, () => t0 + 1000);
        expect(blocked).toEqual({ claimed: false, heldBy: 'bufferClients' });
        const later = await withPoolClaim(modelB, '919000000102', 'promoteClients', async () => 2, () => t0 + POOL_CLAIM_LEASE_MS + 1);
        expect(later).toEqual({ claimed: true, value: 2 });
    });

    test('same pool is re-entrant and the claim doc is never deleted', async () => {
        const r = await withPoolClaim(modelA, '919000000103', 'bufferClients', async () =>
            withPoolClaim(modelA, '919000000103', 'bufferClients', async () => 'nested'));
        expect(r).toEqual({ claimed: true, value: { claimed: true, value: 'nested' } });
        expect(await connA.collection(POOL_CLAIM_COLLECTION).countDocuments({ mobile: '919000000103' })).toBe(1);
    });

    test('concurrent claims for two pools: exactly one runs', async () => {
        const runs: string[] = [];
        const [a, b] = await Promise.all([
            withPoolClaim(modelA, '919000000104', 'bufferClients', async () => { runs.push('buffer'); await new Promise((r) => setTimeout(r, 50)); }),
            withPoolClaim(modelB, '919000000104', 'promoteClients', async () => { runs.push('promote'); await new Promise((r) => setTimeout(r, 50)); }),
        ]);
        expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
        expect(runs).toHaveLength(1);
    });

    test('a model without a connection (unit fakes) just runs fn', async () => {
        const r = await withPoolClaim({} as any, '919000000105', 'bufferClients', async () => 'x');
        expect(r).toEqual({ claimed: true, value: 'x' });
    });
});

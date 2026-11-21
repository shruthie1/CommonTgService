import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { NotFoundException } from '@nestjs/common';
import { UpiIdService } from '../upi-ids.service';
import { UpiId, UpiIdSchema } from '../upi-ids.schema';

describe('UpiIdService', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<UpiId>;
  let service: UpiIdService;

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'upi-svc-test' }).asPromise();
    model = connection.model<UpiId>('UpiIdSvcTest', UpiIdSchema);
    await model.init();
  });

  beforeEach(() => {
    service = new UpiIdService(model as any);
    // Replace private sleep with immediate resolve to avoid real timers.
    (service as any).sleep = () => Promise.resolve();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await model.deleteMany({});
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
    await mongod.stop();
  });

  describe('onModuleInit', () => {
    it('initializes and caches data when present', async () => {
      await connection.collection('upiidsvctests').insertOne({ phonepe: 'a@upi', updatedAt: new Date() });
      await service.onModuleInit();
      const status = service.getServiceStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.hasCachedData).toBe(true);
    });

    it('logs and rethrows when refreshUPIs throws', async () => {
      jest.spyOn(model, 'findOne').mockImplementation(() => {
        throw new Error('db down');
      });
      await expect(service.onModuleInit()).rejects.toThrow('UPI ID Service initialization failed');
    });
  });

  describe('refreshUPIs', () => {
    it('sets a copy of the upiIds when data found', async () => {
      await connection.collection('upiidsvctests').insertOne({ gpay: 'g@upi' });
      await service.refreshUPIs();
      expect((service as any).upiIds.gpay).toBe('g@upi');
    });

    it('warns and leaves cache untouched when no data', async () => {
      await service.refreshUPIs();
      expect((service as any).upiIds).toBeNull();
    });

    it('rethrows on db error', async () => {
      jest.spyOn(model, 'findOne').mockImplementation(() => {
        throw new Error('boom');
      });
      await expect(service.refreshUPIs()).rejects.toThrow('boom');
    });
  });

  describe('findOne', () => {
    it('throws when service not initialized', async () => {
      await expect(service.findOne()).rejects.toThrow('Service not initialized');
    });

    it('returns a copy of cached data', async () => {
      await connection.collection('upiidsvctests').insertOne({ paytm: 'p@upi' });
      await service.onModuleInit();
      const result = await service.findOne();
      expect(result.paytm).toBe('p@upi');
      // mutation does not affect cache
      result.paytm = 'changed';
      const again = await service.findOne();
      expect(again.paytm).toBe('p@upi');
    });

    it('fetches from db and caches on cache miss', async () => {
      (service as any).isInitialized = true;
      (service as any).upiIds = null;
      await connection.collection('upiidsvctests').insertOne({ bhim: 'b@upi' });
      const result = await service.findOne();
      expect(result.bhim).toBe('b@upi');
      expect((service as any).upiIds.bhim).toBe('b@upi');
    });

    it('returns null and warns when db has no data', async () => {
      (service as any).isInitialized = true;
      (service as any).upiIds = null;
      const result = await service.findOne();
      expect(result).toBeNull();
    });

    it('rethrows on db error', async () => {
      (service as any).isInitialized = true;
      (service as any).upiIds = null;
      jest.spyOn(model, 'findOne').mockImplementation(() => {
        throw new Error('db boom');
      });
      await expect(service.findOne()).rejects.toThrow('db boom');
    });
  });

  describe('update', () => {
    it('throws on invalid input (null)', async () => {
      await expect(service.update(null)).rejects.toThrow('Invalid update data');
    });

    it('throws on invalid input (non-object)', async () => {
      await expect(service.update('string' as any)).rejects.toThrow('Invalid update data');
    });

    it('upserts, strips _id, persists the payee keys, caches and returns the doc', async () => {
      // strict false (batch 7): the flat payee keys reach Mongo. Before, strict mode cast the $set to {} and only _id survived.
      const result = await service.update({ _id: 'should-be-removed', gpay: 'new@upi' });
      expect(result).toBeTruthy();
      expect(result._id).toBeDefined();
      expect(result._id).not.toBe('should-be-removed');
      expect(result.gpay).toBe('new@upi');
      expect((service as any).upiIds).toEqual(result);
      expect(await model.countDocuments({})).toBe(1);
      // a fresh read (not the cache) returns the new value
      const fresh: any = await model.findOne({}).lean().exec();
      expect(fresh.gpay).toBe('new@upi');
    });

    it('a second PATCH rotates one key and keeps the others; GET keeps every payee key', async () => {
      await service.update({ gpay: 'old@upi', ppay: 'pp@upi' });
      await service.update({ gpay: 'rotated@upi' });
      const fresh: any = await model.findOne({}).lean().exec();
      expect(fresh.gpay).toBe('rotated@upi');
      expect(fresh.ppay).toBe('pp@upi');
      (service as any).isInitialized = true;
      await service.refreshUPIs();
      const got = await service.findOne();
      expect(got.gpay).toBe('rotated@upi');
      expect(got.ppay).toBe('pp@upi');
    });

    it('a refresh or read-through that started before a PATCH never publishes its older doc (kind=stale_read_skipped)', async () => {
      await service.update({ gpay: 'old@upi' });
      (service as any).isInitialized = true;
      const warn = jest.spyOn((service as any).logger, 'warn');
      const real = (service as any).executeWithRetry.bind(service);
      // The DB read returns the pre-PATCH doc, and a PATCH lands while it is in flight.
      const racing = async () => {
        const before = await real(async () => model.findOne({}).lean().exec());
        await service.update({ gpay: 'new@upi' });
        return before;
      };
      jest.spyOn(service as any, 'executeWithRetry').mockImplementationOnce(racing);
      await service.refreshUPIs();
      expect((service as any).upiIds.gpay).toBe('new@upi');

      (service as any).upiIds = null;
      jest.spyOn(service as any, 'executeWithRetry').mockImplementationOnce(async () => {
        const before = await real(async () => model.findOne({}).lean().exec());
        await service.update({ gpay: 'newer@upi' });
        return before;
      });
      const got = await service.findOne();
      expect(got.gpay).toBe('newer@upi'); // the caller gets the PATCHed doc, not the older read
      expect((service as any).upiIds.gpay).toBe('newer@upi'); // the cache keeps the PATCH
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('kind=stale_read_skipped'));
      expect(lines).toEqual([
        '[upi-ids] kind=stale_read_skipped path=refresh: a PATCH landed during the read, cache kept',
        '[upi-ids] kind=stale_read_skipped path=read_through: a PATCH landed during the read, cache kept',
      ]);
      for (const l of lines) expect(l).not.toContain('@');
    });

    it('read-through that found no doc while a PATCH created one returns the PATCHed doc', async () => {
      (service as any).isInitialized = true;
      (service as any).upiIds = null;
      jest.spyOn(service as any, 'executeWithRetry').mockImplementationOnce(async () => {
        await service.update({ gpay: 'first@upi' });
        return null; // the read ran before the PATCH upserted the doc
      });
      const got = await service.findOne();
      expect(got.gpay).toBe('first@upi');
    });

    it('throws NotFound when findOneAndUpdate resolves null', async () => {
      jest.spyOn(model, 'findOneAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);
      await expect(service.update({ gpay: 'x@upi' })).rejects.toThrow(NotFoundException);
    });

    it('rethrows on db error', async () => {
      jest.spyOn(model, 'findOneAndUpdate').mockImplementation(() => {
        throw new Error('update boom');
      });
      await expect(service.update({ gpay: 'x@upi' })).rejects.toThrow('update boom');
    });

    it('two overlapping PATCHes: the earlier one finishing last cannot put its payee back (kind=update_queued, kind=updated)', async () => {
      (service as any).isInitialized = true;
      const log = jest.spyOn((service as any).logger, 'log');
      const real = model.findOneAndUpdate.bind(model);
      const order: string[] = [];
      let releaseA: () => void = () => undefined;
      const gateA = new Promise<void>((r) => (releaseA = r));
      jest.spyOn(model, 'findOneAndUpdate').mockImplementation(((filter: any, update: any, opts: any) => {
        const gpay = update.$set.gpay;
        order.push(`start ${gpay}`);
        return {
          exec: async () => {
            // A's write is slow: before serialisation B's response arrived first and A then overwrote the cache.
            if (gpay === 'a@upi') await gateA;
            const doc = await real(filter, update, opts).exec();
            order.push(`done ${gpay}`);
            return doc;
          },
        };
      }) as any);
      const a = service.update({ gpay: 'a@upi' });
      const b = service.update({ gpay: 'b@upi' });
      await new Promise((r) => setTimeout(r, 20));
      expect(order).toEqual(['start a@upi']); // B has not started while A is in flight
      releaseA();
      const [ra, rb] = await Promise.all([a, b]);
      expect(order).toEqual(['start a@upi', 'done a@upi', 'start b@upi', 'done b@upi']);
      expect(ra.gpay).toBe('a@upi');
      expect(rb.gpay).toBe('b@upi');
      expect((service as any).upiIds.gpay).toBe('b@upi');
      expect((await service.findOne()).gpay).toBe('b@upi'); // the following GET
      const fresh: any = await model.findOne({}).lean().exec();
      expect(fresh.gpay).toBe('b@upi');
      const lines = log.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('kind='));
      expect(lines).toEqual([
        '[upi-ids] kind=update_queued ahead=1: waits for the earlier PATCH',
        '[upi-ids] kind=updated keys=1',
        '[upi-ids] kind=updated keys=1',
      ]);
      for (const l of lines) expect(l).not.toContain('@upi');
    });

    it('a failed PATCH does not block the next one; kind=update_failed masks ids', async () => {
      const err = jest.spyOn((service as any).logger, 'error');
      jest
        .spyOn(service as any, 'executeWithRetry')
        .mockImplementationOnce(() => Promise.reject(new Error('E11000 dup key gpay: "x@ybl"')));
      await expect(service.update({ gpay: 'x@ybl' })).rejects.toThrow('E11000');
      const next = await service.update({ gpay: 'y@upi' });
      expect(next.gpay).toBe('y@upi');
      expect((service as any).upiIds.gpay).toBe('y@upi');
      const lines = err.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('kind=update_failed'));
      expect(lines).toEqual(['[upi-ids] kind=update_failed reason=E11000 dup key gpay: <id>: cache kept']);
    });

    it('no document: refresh and read-through log kind=no_doc', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn');
      await service.refreshUPIs();
      (service as any).isInitialized = true;
      expect(await service.findOne()).toBeNull();
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('kind=no_doc'));
      expect(lines).toEqual([
        '[upi-ids] kind=no_doc path=refresh: no upi-ids document, cache kept',
        '[upi-ids] kind=no_doc path=read_through: no upi-ids document',
      ]);
    });
  });

  describe('executeWithRetry', () => {
    it('succeeds on first try', async () => {
      const op = jest.fn().mockResolvedValue('ok');
      const res = await (service as any).executeWithRetry(op);
      expect(res).toBe('ok');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries then succeeds', async () => {
      const op = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockResolvedValue('ok');
      const res = await (service as any).executeWithRetry(op);
      expect(res).toBe('ok');
      expect(op).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and throws the last error', async () => {
      const op = jest.fn().mockRejectedValue(new Error('always fails'));
      await expect((service as any).executeWithRetry(op, 2)).rejects.toThrow('always fails');
      expect(op).toHaveBeenCalledTimes(2);
    });
  });

  describe('getServiceStatus', () => {
    it('reports uninitialized with no cached data', () => {
      const status = service.getServiceStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.hasCachedData).toBe(false);
      expect(status.lastUpdate).toBeUndefined();
    });

    it('reports cached data and lastUpdate when present', async () => {
      const now = new Date();
      (service as any).isInitialized = true;
      (service as any).upiIds = { gpay: 'g@upi', updatedAt: now };
      const status = service.getServiceStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.hasCachedData).toBe(true);
      expect(status.lastUpdate).toBe(now);
    });
  });

  describe('periodic interval callback', () => {
    it('invokes refreshUPIs success and error paths of the timer callback', async () => {
      // Cover the setInterval callback body (refreshUPIs + catch) by extracting and
      // invoking it directly. Using fake timers + a live MongoMemoryServer is flaky,
      // so we capture the scheduled callback and run it deterministically.
      const captured: Array<() => Promise<void>> = [];
      const intervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation((cb: any) => {
          captured.push(cb);
          return 123 as any;
        });
      try {
        (service as any).startPeriodicCheck();
        expect(captured.length).toBe(1);

        // success path
        const refreshSpy = jest.spyOn(service, 'refreshUPIs').mockResolvedValueOnce(undefined);
        await captured[0]();
        expect(refreshSpy).toHaveBeenCalledTimes(1);

        // error path -> caught and logged, does not throw
        refreshSpy.mockRejectedValueOnce(new Error('periodic boom'));
        await expect(captured[0]()).resolves.toBeUndefined();
        expect(refreshSpy).toHaveBeenCalledTimes(2);
      } finally {
        intervalSpy.mockRestore();
      }
    });
  });

  describe('real sleep', () => {
    it('resolves after the given delay', async () => {
      // exercise the real private sleep (not the overridden one) for line coverage
      const real = new UpiIdService(model as any);
      jest.useFakeTimers();
      try {
        const p = (real as any).sleep(1000);
        jest.advanceTimersByTime(1000);
        await expect(p).resolves.toBeUndefined();
      } finally {
        real.onModuleDestroy();
        jest.useRealTimers();
      }
    });
  });

  describe('startPeriodicCheck / onModuleDestroy', () => {
    it('clears an existing interval when starting again and on destroy', async () => {
      await connection.collection('upiidsvctests').insertOne({ gpay: 'g@upi' });
      await service.onModuleInit();
      expect((service as any).checkInterval).not.toBeNull();
      // calling startPeriodicCheck again clears the prior interval (branch coverage)
      (service as any).startPeriodicCheck();
      expect((service as any).checkInterval).not.toBeNull();
      service.onModuleDestroy();
      expect((service as any).checkInterval).toBeNull();
      // destroy again with null interval (other branch)
      service.onModuleDestroy();
      expect((service as any).checkInterval).toBeNull();
    });
  });
});

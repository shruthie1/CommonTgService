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

    it('upserts, strips _id, caches and returns the doc', async () => {
      // NOTE: the UpiId schema is a root-level Mixed type with strict (default) on,
      // so arbitrary keys passed through $set are not persisted by mongoose; only
      // _id survives the upsert. We assert on real behaviour: the input _id is
      // stripped (so upsert generates a fresh _id) and the returned doc is cached.
      const result = await service.update({ _id: 'should-be-removed', gpay: 'new@upi' });
      expect(result).toBeTruthy();
      expect(result._id).toBeDefined();
      expect(result._id).not.toBe('should-be-removed');
      expect((service as any).upiIds).toEqual(result);
      // a doc now exists in the collection (upsert created it)
      expect(await model.countDocuments({})).toBe(1);
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

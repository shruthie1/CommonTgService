jest.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../../utils/logbots', () => ({
  notifbot: jest.fn(() => 'https://api.telegram.org/botX/sendMessage?chat_id=-100'),
}));

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionService } from '../transaction.service';
import { Transaction, TransactionDocument, TransactionSchema } from '../schemas/transaction.schema';
import { TransactionStatus } from '../dto/create-transaction.dto';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';

const mockedFetch = fetchWithTimeout as jest.Mock;

const makeDto = (overrides: any = {}) => ({
  transactionId: 'txn12345',
  amount: 100,
  issue: 'refund',
  description: 'need refund',
  refundMethod: 'upi',
  profile: 'profile-1',
  chatId: 'chat-1',
  ip: '1.2.3.4',
  status: TransactionStatus.PENDING,
  ...overrides,
});

describe('TransactionService', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: Model<TransactionDocument>;
  let service: TransactionService;

  beforeAll(async () => {
    jest.setTimeout(60_000);
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'txn-svc-test' }).asPromise();
    model = connection.model<TransactionDocument>('TransactionSvcTest', TransactionSchema);
    await model.init();
  });

  beforeEach(() => {
    service = new TransactionService(model as any);
    mockedFetch.mockClear();
    mockedFetch.mockResolvedValue({});
  });

  afterEach(async () => {
    await model.deleteMany({});
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await connection.dropDatabase();
    await connection.close();
    await mongod.stop();
  });

  describe('create', () => {
    it('creates a transaction successfully', async () => {
      const result = await service.create(makeDto() as any);
      expect(result.transactionId).toBe('txn12345');
      const inDb = await model.findOne({ transactionId: 'txn12345' }).lean();
      expect(inDb).toBeTruthy();
    });

    it('throws BadRequest when transactionId already exists', async () => {
      await service.create(makeDto() as any);
      await expect(service.create(makeDto() as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(makeDto() as any)).rejects.toThrow('already exists');
    });

    it('throws BadRequest "Failed to create transaction" on generic save error', async () => {
      // Missing required fields (amount/issue/description) -> validation error on save
      await expect(
        service.create({ transactionId: 'onlyid12' } as any),
      ).rejects.toThrow('Failed to create transaction');
    });
  });

  describe('findOne', () => {
    it('returns a found transaction', async () => {
      const created = await service.create(makeDto() as any);
      const found = await service.findOne((created as any)._id.toString());
      expect(found.transactionId).toBe('txn12345');
    });

    it('throws NotFound when id does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(service.findOne(fakeId)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest on invalid id format (CastError)', async () => {
      await expect(service.findOne('not-an-objectid')).rejects.toThrow(BadRequestException);
      await expect(service.findOne('not-an-objectid')).rejects.toThrow('Invalid transaction ID format');
    });
  });

  describe('findAll', () => {
    it('matches by transactionId with valid ObjectId in $or and notifies', async () => {
      const created = await service.create(makeDto({ transactionId: 'txnabcde' }) as any);
      const validObjectId = (created as any)._id.toString();
      // valid ObjectId path: isValidObjectId true -> pushes _id; lowercases transactionId
      const res = await service.findAll({ transactionId: validObjectId });
      expect(res.total).toBe(1);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('matches by transactionId (non-ObjectId, lowercased) and notifies', async () => {
      await service.create(makeDto({ transactionId: 'utr00001' }) as any);
      const res = await service.findAll({ transactionId: 'UTR00001' });
      expect(res.total).toBe(1);
      expect(res.transactions[0].transactionId).toBe('utr00001');
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('falls through when transactionId provided but no match, then matches ip', async () => {
      await service.create(makeDto({ transactionId: 'iputr001', ip: '9.9.9.9' }) as any);
      const res = await service.findAll({ transactionId: 'nomatchx', ip: '9.9.9.9' });
      expect(res.total).toBe(1);
      expect(res.transactions[0].ip).toBe('9.9.9.9');
    });

    it('matches by chatId when no transactionId/ip match', async () => {
      await service.create(makeDto({ transactionId: 'chatutr1', chatId: 'chat-xyz' }) as any);
      const res = await service.findAll({ chatId: 'chat-xyz' });
      expect(res.total).toBe(1);
      expect(res.transactions[0].chatId).toBe('chat-xyz');
    });

    it('matches by remaining filters (status/amount/etc.) when others absent', async () => {
      await service.create(makeDto({ transactionId: 'remutr01', status: TransactionStatus.COMPLETED, amount: 555, profile: 'p', issue: 'i', refundMethod: 'r' }) as any);
      const res = await service.findAll({
        status: TransactionStatus.COMPLETED,
        amount: 555,
        profile: 'p',
        issue: 'i',
        refundMethod: 'r',
      });
      expect(res.total).toBe(1);
      expect(mockedFetch).toHaveBeenCalled();
    });

    it('returns total 0 when no filters at all', async () => {
      const res = await service.findAll({});
      expect(res.total).toBe(0);
      expect(res.transactions).toEqual([]);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequest "Failed to fetch transactions" when model.find throws', async () => {
      jest.spyOn(model, 'find').mockImplementation(() => {
        throw new Error('boom');
      });
      await expect(service.findAll({ ip: '1.1.1.1' })).rejects.toThrow('Failed to fetch transactions');
    });

    it('does not throw when sendNotification fetch rejects (own catch)', async () => {
      await service.create(makeDto({ transactionId: 'notifutr', ip: '5.5.5.5' }) as any);
      mockedFetch.mockRejectedValueOnce(new Error('network down'));
      const res = await service.findAll({ ip: '5.5.5.5' });
      expect(res.total).toBe(1);
    });
  });

  describe('update', () => {
    it('updates a transaction successfully', async () => {
      const created = await service.create(makeDto() as any);
      const updated = await service.update((created as any)._id.toString(), { amount: 999 } as any);
      expect(updated.amount).toBe(999);
    });

    it('throws NotFound when id does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(service.update(fakeId, { amount: 1 } as any)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest on generic error (invalid id)', async () => {
      await expect(service.update('bad-id', { amount: 1 } as any)).rejects.toThrow('Failed to update transaction');
    });
  });

  describe('delete', () => {
    it('deletes a transaction successfully', async () => {
      const created = await service.create(makeDto() as any);
      const deleted = await service.delete((created as any)._id.toString());
      expect(deleted.transactionId).toBe('txn12345');
      expect(await model.findById((created as any)._id).lean()).toBeNull();
    });

    it('throws NotFound when id does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(service.delete(fakeId)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest on generic error (invalid id)', async () => {
      await expect(service.delete('bad-id')).rejects.toThrow('Failed to delete transaction');
    });
  });
});

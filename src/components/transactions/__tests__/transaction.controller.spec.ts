import { TransactionController } from '../transaction.controller';
import { TransactionStatus } from '../dto/create-transaction.dto';

describe('TransactionController', () => {
  let service: any;
  let controller: TransactionController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    controller = new TransactionController(service);
  });

  it('create delegates to service.create', async () => {
    const dto = { transactionId: 'txn12345', amount: 1 } as any;
    service.create.mockResolvedValue({ id: '1' });
    const res = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ id: '1' });
  });

  it('findOne delegates to service.findOne', async () => {
    service.findOne.mockResolvedValue({ id: '1' });
    const res = await controller.findOne('abc');
    expect(service.findOne).toHaveBeenCalledWith('abc');
    expect(res).toEqual({ id: '1' });
  });

  it('findAll passes filter object, limit and offset', async () => {
    service.findAll.mockResolvedValue({ transactions: [], total: 0 });
    const res = await controller.findAll(
      'txn',
      100,
      'issue',
      'upi',
      'profile',
      'chat',
      '1.2.3.4',
      TransactionStatus.PENDING,
      5,
      10,
    );
    expect(service.findAll).toHaveBeenCalledWith(
      {
        transactionId: 'txn',
        amount: 100,
        issue: 'issue',
        refundMethod: 'upi',
        profile: 'profile',
        chatId: 'chat',
        status: TransactionStatus.PENDING,
        ip: '1.2.3.4',
      },
      5,
      10,
    );
    expect(res).toEqual({ transactions: [], total: 0 });
  });

  it('update delegates to service.update', async () => {
    const dto = { amount: 2 } as any;
    service.update.mockResolvedValue({ id: '1' });
    const res = await controller.update('abc', dto);
    expect(service.update).toHaveBeenCalledWith('abc', dto);
    expect(res).toEqual({ id: '1' });
  });

  it('delete delegates to service.delete', async () => {
    service.delete.mockResolvedValue({ id: '1' });
    const res = await controller.delete('abc');
    expect(service.delete).toHaveBeenCalledWith('abc');
    expect(res).toEqual({ id: '1' });
  });
});

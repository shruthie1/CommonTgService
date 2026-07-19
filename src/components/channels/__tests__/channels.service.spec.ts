import { BadRequestException } from '@nestjs/common';
import { ChannelsService } from '../channels.service';

function execQuery<T>(result: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(async () => result),
  };
}

describe('ChannelsService channel-state persistence', () => {
  test('createMultiple updates canonical identity/live state and preserves bans', async () => {
    const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    const service = new ChannelsService({ bulkWrite } as any);

    await service.createMultiple([
      {
        channelId: '123',
        title: 'adult chat',
        username: 'adult_chat',
        participantsCount: 1200,
        megagroup: true,
        broadcast: false,
        canSendMsgs: true,
        private: false,
        forbidden: false,
        banned: false,
        bannedAt: null,
      },
    ]);

    expect(bulkWrite).toHaveBeenCalledWith(expect.any(Array), { ordered: false });
    const operation = (bulkWrite.mock.calls as any)[0][0][0].updateOne.update[0].$set;
    expect(operation.title).toEqual({ $literal: 'adult chat' });
    expect(operation.username).toEqual({ $literal: 'adult_chat' });
    expect(operation.participantsCount).toEqual({ $literal: 1200 });
    expect(operation.private).toEqual({ $literal: false });
    expect(operation.broadcast).toEqual({ $literal: false });
    expect(operation.banned).toEqual(expect.any(Object));
    expect(operation.forbidden).toEqual(expect.any(Object));
    expect(operation.canSendMsgs).toEqual(expect.objectContaining({ $cond: expect.any(Array) }));
  });

  test('new catalog rows fail closed when no live sendability fact is supplied', async () => {
    const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    const service = new ChannelsService({ bulkWrite } as any);

    await service.createMultiple([{ channelId: 'unverified', title: 'Unverified' }]);

    const operation = (bulkWrite.mock.calls as any)[0][0][0].updateOne.update[0].$set;
    expect(operation.canSendMsgs.$cond[2]).toEqual({
      $ifNull: ['$canSendMsgs', { $literal: false }],
    });
  });

  test('createMultiple rejects malformed batches before creating bad upserts', async () => {
    const bulkWrite = jest.fn();
    const service = new ChannelsService({ bulkWrite } as any);

    await expect(service.createMultiple([{}])).rejects.toBeInstanceOf(BadRequestException);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

});

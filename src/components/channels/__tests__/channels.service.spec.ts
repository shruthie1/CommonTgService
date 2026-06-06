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
  test('createMultiple carries fresh Telegram sendability fields into existing documents', async () => {
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
        restricted: false,
        sendMessages: false,
        sendPlain: false,
        private: false,
        forbidden: false,
        banned: false,
        bannedAt: null,
      },
    ]);

    expect(bulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { channelId: '123' },
          update: expect.objectContaining({
            $set: expect.objectContaining({
              canSendMsgs: true,
              sendMessages: false,
              sendPlain: false,
              broadcast: false,
              restricted: false,
              private: false,
              forbidden: false,
              banned: false,
              bannedAt: null,
            }),
          }),
        }),
      }),
    ], { ordered: false });
  });

  test('createMultiple rejects malformed batches before creating bad upserts', async () => {
    const bulkWrite = jest.fn();
    const service = new ChannelsService({ bulkWrite } as any);

    await expect(service.createMultiple([{}])).rejects.toBeInstanceOf(BadRequestException);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  test('onModuleInit repairs legacy contradictory sendability flags', async () => {
    const updateMany = jest.fn(() => ({ exec: jest.fn(async () => ({ modifiedCount: 2 })) }));
    const service = new ChannelsService({ updateMany } as any);

    await service.onModuleInit();

    expect(updateMany).toHaveBeenCalledWith(
      {
        canSendMsgs: true,
        $or: [{ sendMessages: true }, { sendPlain: true }],
        banned: { $ne: true },
        forbidden: { $ne: true },
        private: { $ne: true },
        restricted: { $ne: true },
      },
      {
        $set: expect.objectContaining({
          sendMessages: false,
          sendPlain: false,
        }),
      },
    );
  });
});

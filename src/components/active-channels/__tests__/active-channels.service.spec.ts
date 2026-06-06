import { ActiveChannelsService } from '../active-channels.service';

function execQuery<T>(result: T) {
  return {
    exec: jest.fn(async () => result),
  };
}

describe('ActiveChannelsService channel-state persistence', () => {
  test('createMultiple carries fresh Telegram sendability fields into existing active channel documents', async () => {
    const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    const service = new ActiveChannelsService({ bulkWrite } as any, {} as any);

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

  test('getActiveChannels repairs legacy contradictory sendability flags before selecting candidates', async () => {
    const updateMany = jest.fn(() => execQuery({ modifiedCount: 2 }));
    const aggregate = jest.fn(() => execQuery([]));
    const service = new ActiveChannelsService({ updateMany, aggregate } as any, {} as any);

    await service.getActiveChannels(25, 0, []);

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
    expect(aggregate).toHaveBeenCalled();
  });
});

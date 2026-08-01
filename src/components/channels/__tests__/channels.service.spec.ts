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

// Minimal conversion-aware-sort stub: getActiveChannels always calls
// getFleetPrior()/buildConversionAwareSortStages() now, so any test constructing
// ChannelsService directly needs these on the read-service mock even when the
// test itself is only exercising the exclusion behavior.
function conversionAwareSortStub(extra: Record<string, any> = {}) {
  return {
    getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
    buildConversionAwareSortStages: jest.fn(() => [
      { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
      { $addFields: { sortScore: { $rand: {} } } },
      { $project: { _ci: 0 } },
    ]),
    buildRandomOnlySortStages: jest.fn(() => [
      { $addFields: { sortScore: { $rand: {} } } },
    ]),
    ...extra,
  };
}

describe('ChannelsService channel-state persistence', () => {
  test('createMultiple updates canonical identity/live state and preserves bans', async () => {
    const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    const service = new ChannelsService({ bulkWrite } as any, {} as any);

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
    const service = new ChannelsService({ bulkWrite } as any, {} as any);

    await service.createMultiple([{ channelId: 'unverified', title: 'Unverified' }]);

    const operation = (bulkWrite.mock.calls as any)[0][0][0].updateOne.update[0].$set;
    expect(operation.canSendMsgs.$cond[2]).toEqual({
      $ifNull: ['$canSendMsgs', { $literal: false }],
    });
  });

  test('createMultiple rejects malformed batches before creating bad upserts', async () => {
    const bulkWrite = jest.fn();
    const service = new ChannelsService({ bulkWrite } as any, {} as any);

    await expect(service.createMultiple([{}])).rejects.toBeInstanceOf(BadRequestException);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

});

// ─── getActiveChannels: channelIntelligence exclusion path ───────────────────
// Normal conversion-aware pipelines apply hard CI exclusion in Mongo.
// getExcludedChannelIds is intentionally reserved for random-only fallback,
// where the lookup-based conversion pipeline already failed.
describe('ChannelsService.getActiveChannels exclusion path', () => {
  function aggregateReturning<T>(rows: T) {
    return jest.fn(() => ({ exec: jest.fn(async () => rows) }));
  }

  test('does not call post-fetch getExcludedChannelIds on the conversion-aware path', async () => {
    const aggregate = aggregateReturning([
      { channelId: '111' },
      { channelId: '222' },
      { channelId: '333' },
    ]);
    const getExcludedChannelIds = jest.fn(async () => new Set(['222']));
    const service = new ChannelsService({ aggregate } as any, conversionAwareSortStub({ getExcludedChannelIds }) as any);

    const result = await service.getActiveChannels(50, 0, []);

    expect(getExcludedChannelIds).not.toHaveBeenCalled();
    expect((result as any[]).map((c) => c.channelId)).toEqual(['111', '222', '333']);
  });

  test('over-fetches before final limit on the conversion-aware path', async () => {
    const aggregate = aggregateReturning([
      { channelId: 'blocked' },
      { channelId: 'safe-1' },
      { channelId: 'safe-2' },
    ]);
    const getExcludedChannelIds = jest.fn(async () => new Set(['blocked']));
    const service = new ChannelsService({ aggregate } as any, conversionAwareSortStub({ getExcludedChannelIds }) as any);

    const result = await service.getActiveChannels(1, 0, []);

    const pipeline = (aggregate.mock.calls as any)[0][0];
    expect(pipeline).toEqual(expect.arrayContaining([{ $limit: 3 }]));
    expect(getExcludedChannelIds).not.toHaveBeenCalled();
    expect((result as any[]).map((c) => c.channelId)).toEqual(['blocked']);
  });

  test('FAILS OPEN on fallback: when getExcludedChannelIds throws, returns ALL fallback results', async () => {
    const aggregate = jest
      .fn()
      .mockImplementationOnce(() => { throw new Error('lookup unavailable'); })
      .mockImplementationOnce(() => ({ exec: jest.fn(async () => [{ channelId: '111' }, { channelId: '222' }]) }));
    const getExcludedChannelIds = jest.fn(async () => {
      throw new Error('channelIntelligence unavailable');
    });
    const service = new ChannelsService({ aggregate } as any, conversionAwareSortStub({ getExcludedChannelIds }) as any);

    const result = await service.getActiveChannels(50, 0, []);

    expect(getExcludedChannelIds).toHaveBeenCalledTimes(1);
    expect(getExcludedChannelIds).toHaveBeenCalledWith(['111', '222']);
    expect((result as any[]).map((c) => c.channelId)).toEqual(['111', '222']);
  });

  test('fallback with an empty excluded set returns all results unchanged', async () => {
    const aggregate = jest
      .fn()
      .mockImplementationOnce(() => { throw new Error('lookup unavailable'); })
      .mockImplementationOnce(() => ({ exec: jest.fn(async () => [{ channelId: '111' }, { channelId: '222' }]) }));
    const getExcludedChannelIds = jest.fn(async () => new Set<string>());
    const service = new ChannelsService({ aggregate } as any, conversionAwareSortStub({ getExcludedChannelIds }) as any);

    const result = await service.getActiveChannels(50, 0, []);

    expect(getExcludedChannelIds).toHaveBeenCalledTimes(1);
    expect((result as any[]).map((c) => c.channelId)).toEqual(['111', '222']);
  });

  test('does not call getExcludedChannelIds when the aggregate returns no rows', async () => {
    const aggregate = aggregateReturning([]);
    const getExcludedChannelIds = jest.fn(async () => new Set<string>());
    const service = new ChannelsService({ aggregate } as any, conversionAwareSortStub({ getExcludedChannelIds }) as any);

    const result = await service.getActiveChannels(50, 0, []);

    expect(result).toEqual([]);
    expect(getExcludedChannelIds).not.toHaveBeenCalled();
  });
});

describe('ChannelsService.getActiveChannels uses conversion-aware sort', () => {
  it('calls getFleetPrior and splices the lookup-based sort stages', async () => {
    const captured: any[] = [];
    const ChannelModel: any = {
      aggregate: (pipeline: any[]) => { captured.push(pipeline); return { exec: async () => [] }; },
    };
    const readSvc: any = {
      getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
      buildConversionAwareSortStages: jest.fn(() => [
        { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
        { $addFields: { sortScore: { $rand: {} } } },
        { $project: { _ci: 0 } },
      ]),
      getExcludedChannelIds: jest.fn(async () => new Set()),
    };
    const svc: any = Object.create(ChannelsService.prototype);
    svc.ChannelModel = ChannelModel;
    svc.channelIntelligenceReadService = readSvc;

    await svc.getActiveChannels(50, 0, []);

    expect(readSvc.getFleetPrior).toHaveBeenCalled();
    expect(readSvc.buildConversionAwareSortStages).toHaveBeenCalledWith({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const json = JSON.stringify(captured[0]);
    expect(json).toContain('channelIntelligence');
    expect(json).not.toContain('reactRestricted');
    expect(json).not.toContain('clientsJoined');
  });
});

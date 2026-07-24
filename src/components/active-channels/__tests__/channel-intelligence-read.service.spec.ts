import { ChannelIntelligenceReadService } from '../channel-intelligence-read.service';

describe('ChannelIntelligenceReadService.getExcludedChannelIds', () => {
  const docs = [
    { channelId: '1', safety: { status: 'blocked', consecutiveErrors: 0 }, outcomes: { attempted: 0, deleted: 0 } },
    { channelId: '2', safety: { status: 'active', consecutiveErrors: 3 }, outcomes: { attempted: 0, deleted: 0 } },
    { channelId: '3', safety: { status: 'active', consecutiveErrors: 0 }, outcomes: { attempted: 20, deleted: 15 } },
    { channelId: '4', safety: { status: 'active', consecutiveErrors: 0 }, outcomes: { attempted: 20, deleted: 2 } },
  ];
  const model = { find: () => ({ lean: () => ({ exec: async () => docs }) }) } as any;

  it('excludes blocked, high-error, high-deletion; keeps healthy', async () => {
    const svc = new ChannelIntelligenceReadService(model);
    const set = await svc.getExcludedChannelIds(['1', '2', '3', '4', '5']);
    expect([...set].sort()).toEqual(['1', '2', '3']);
  });

  it('returns an empty set for an empty candidate list without querying', async () => {
    const spyModel = { find: jest.fn() } as any;
    const svc = new ChannelIntelligenceReadService(spyModel);
    const set = await svc.getExcludedChannelIds([]);
    expect(set.size).toBe(0);
    expect(spyModel.find).not.toHaveBeenCalled();
  });

  it('treats missing/null doc fields as not excluded', async () => {
    const partialDocs = [
      { channelId: '10' },
      { channelId: '11', safety: null, outcomes: null },
      { channelId: '12', safety: { status: null, consecutiveErrors: null }, outcomes: { attempted: null, deleted: null } },
    ];
    const partialModel = { find: () => ({ lean: () => ({ exec: async () => partialDocs }) }) } as any;
    const svc = new ChannelIntelligenceReadService(partialModel);
    const set = await svc.getExcludedChannelIds(['10', '11', '12']);
    expect(set.size).toBe(0);
  });
});

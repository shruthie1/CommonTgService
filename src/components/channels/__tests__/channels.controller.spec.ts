import { ChannelsController } from '../channels.controller';

function makeService() {
  return {
    create: jest.fn().mockResolvedValue({ channelId: 'c1' }),
    createMultiple: jest.fn().mockResolvedValue('Channels Saved'),
    search: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ channelId: 'c1' }),
    update: jest.fn().mockResolvedValue({ channelId: 'c1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ChannelsController', () => {
  test('create', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.create({ channelId: 'c1' } as any);
    expect(svc.create).toHaveBeenCalled();
  });

  test('createMultiple', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    const r = await c.createMultiple([{ channelId: 'c1' } as any]);
    expect(r).toBe('Channels Saved');
  });

  test('search', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.search({ restricted: true } as any);
    expect(svc.search).toHaveBeenCalled();
  });

  test('findAll', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.findAll();
    expect(svc.findAll).toHaveBeenCalled();
  });

  test('findOne', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.findOne('c1');
    expect(svc.findOne).toHaveBeenCalledWith('c1');
  });

  test('update', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.update('c1', { participantsCount: 5 } as any);
    expect(svc.update).toHaveBeenCalledWith('c1', { participantsCount: 5 });
  });

  test('remove', async () => {
    const svc = makeService();
    const c = new ChannelsController(svc as any);
    await c.remove('c1');
    expect(svc.remove).toHaveBeenCalledWith('c1');
  });
});

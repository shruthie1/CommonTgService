import { ActiveChannelsController } from '../active-channels.controller';

describe('ActiveChannelsController', () => {
    let stub: any;
    let controller: ActiveChannelsController;

    beforeEach(() => {
        stub = {
            create: jest.fn().mockResolvedValue('created'),
            createMultiple: jest.fn().mockResolvedValue('createdMultiple'),
            autoHealChannels: jest.fn().mockResolvedValue('healed'),
            analytics: jest.fn().mockResolvedValue('analytics'),
            paginated: jest.fn().mockResolvedValue('paginated'),
            search: jest.fn().mockResolvedValue(['result']),
            findAll: jest.fn().mockResolvedValue(['all']),
            findOne: jest.fn().mockResolvedValue('one'),
            update: jest.fn().mockResolvedValue('updated'),
            remove: jest.fn().mockResolvedValue('removed'),
        };
        controller = new ActiveChannelsController(stub as any);
    });

    it('create delegates', async () => {
        const dto: any = { channelId: 'c1' };
        await expect(controller.create(dto)).resolves.toBe('created');
        expect(stub.create).toHaveBeenCalledWith(dto);
    });

    it('createMultiple delegates', async () => {
        const dtos: any = [{ channelId: 'c1' }, { channelId: 'c2' }];
        await expect(controller.createMultiple(dtos)).resolves.toBe('createdMultiple');
        expect(stub.createMultiple).toHaveBeenCalledWith(dtos);
    });

    it('autoHeal delegates', async () => {
        await expect(controller.autoHeal()).resolves.toBe('healed');
        expect(stub.autoHealChannels).toHaveBeenCalledTimes(1);
    });

    it('analytics delegates', async () => {
        await expect(controller.analytics()).resolves.toBe('analytics');
        expect(stub.analytics).toHaveBeenCalledTimes(1);
    });

    describe('paginated', () => {
        it('parses provided params, sortOrder asc, passthrough filter', async () => {
            await controller.paginated('2', '50', 'title', 'asc', 'foo', 'banned');
            expect(stub.paginated).toHaveBeenCalledWith({
                page: 2,
                limit: 50,
                sortBy: 'title',
                sortOrder: 'asc',
                search: 'foo',
                filter: 'banned',
            });
        });

        it('handles undefined params, sortOrder defaults to desc, empty search → undefined', async () => {
            await controller.paginated(undefined, undefined, undefined, undefined, '', undefined);
            expect(stub.paginated).toHaveBeenCalledWith({
                page: undefined,
                limit: undefined,
                sortBy: undefined,
                sortOrder: 'desc',
                search: undefined,
                filter: undefined,
            });
        });

        it('non-asc sortOrder maps to desc', async () => {
            await controller.paginated('1', '10', undefined, 'something', undefined, undefined);
            expect(stub.paginated).toHaveBeenCalledWith(
                expect.objectContaining({ sortOrder: 'desc' }),
            );
        });
    });

    it('search passes the query', async () => {
        const query: any = { channelId: 'c1', broadcast: true };
        await expect(controller.search(query)).resolves.toEqual(['result']);
        expect(stub.search).toHaveBeenCalledWith(query);
    });

    it('findAll delegates', async () => {
        await expect(controller.findAll()).resolves.toEqual(['all']);
        expect(stub.findAll).toHaveBeenCalledTimes(1);
    });

    it('findOne delegates with channelId', async () => {
        await expect(controller.findOne('c1')).resolves.toBe('one');
        expect(stub.findOne).toHaveBeenCalledWith('c1');
    });

    it('update delegates with channelId and dto', async () => {
        const dto: any = { title: 'x' };
        await expect(controller.update('c1', dto)).resolves.toBe('updated');
        expect(stub.update).toHaveBeenCalledWith('c1', dto);
    });

    it('remove delegates with channelId', async () => {
        await expect(controller.remove('c1')).resolves.toBe('removed');
        expect(stub.remove).toHaveBeenCalledWith('c1');
    });
});

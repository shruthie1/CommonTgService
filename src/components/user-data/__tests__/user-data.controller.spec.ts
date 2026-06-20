import { UserDataController } from '../user-data.controller';

describe('UserDataController', () => {
    let service: any;
    let controller: UserDataController;

    beforeEach(() => {
        service = {
            create: jest.fn().mockResolvedValue({ id: 1 }),
            search: jest.fn().mockResolvedValue([{ id: 1 }]),
            findAll: jest.fn().mockResolvedValue([{ id: 1 }]),
            updateAll: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
            findOne: jest.fn().mockResolvedValue({ id: 1 }),
            update: jest.fn().mockResolvedValue({ id: 1 }),
            remove: jest.fn().mockResolvedValue({ id: 1 }),
            clearCount: jest.fn().mockReturnValue('cleared'),
            executeQuery: jest.fn().mockResolvedValue([{ id: 1 }]),
        };
        controller = new UserDataController(service);
    });

    it('create delegates', async () => {
        const dto = { profile: 'p' } as any;
        await expect(controller.create(dto)).resolves.toEqual({ id: 1 });
        expect(service.create).toHaveBeenCalledWith(dto);
    });

    it('search delegates', async () => {
        const q = { profile: 'p' } as any;
        await expect(controller.search(q)).resolves.toEqual([{ id: 1 }]);
        expect(service.search).toHaveBeenCalledWith(q);
    });

    it('findAll delegates', async () => {
        await expect(controller.findAll()).resolves.toEqual([{ id: 1 }]);
        expect(service.findAll).toHaveBeenCalled();
    });

    it('updateAll delegates', async () => {
        const dto = { totalCount: 1 } as any;
        await expect(controller.updateAll('chat1', dto)).resolves.toEqual({ modifiedCount: 2 });
        expect(service.updateAll).toHaveBeenCalledWith('chat1', dto);
    });

    it('findOne delegates', async () => {
        await expect(controller.findOne('p', 'c')).resolves.toEqual({ id: 1 });
        expect(service.findOne).toHaveBeenCalledWith('p', 'c');
    });

    it('update delegates', async () => {
        const dto = { totalCount: 5 } as any;
        await expect(controller.update('p', 'c', dto)).resolves.toEqual({ id: 1 });
        expect(service.update).toHaveBeenCalledWith('p', 'c', dto);
    });

    it('remove delegates', async () => {
        await expect(controller.remove('p', 'c')).resolves.toEqual({ id: 1 });
        expect(service.remove).toHaveBeenCalledWith('p', 'c');
    });

    it('clearCount delegates', () => {
        expect(controller.clearCount('c')).toBe('cleared');
        expect(service.clearCount).toHaveBeenCalledWith('c');
    });

    describe('executeQuery', () => {
        it('destructures the body and delegates', async () => {
            const body = { query: { a: 1 }, sort: { a: -1 }, limit: 10, skip: 2 };
            await expect(controller.executeQuery(body)).resolves.toEqual([{ id: 1 }]);
            expect(service.executeQuery).toHaveBeenCalledWith({ a: 1 }, { a: -1 }, 10, 2);
        });

        it('rethrows errors from the service', async () => {
            service.executeQuery.mockRejectedValueOnce(new Error('boom'));
            await expect(controller.executeQuery({ query: {} })).rejects.toThrow('boom');
        });
    });
});

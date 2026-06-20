import { ClientController } from '../client.controller';

describe('ClientController', () => {
    let stub: any;
    let controller: ClientController;

    beforeEach(() => {
        stub = {
            create: jest.fn().mockResolvedValue('created'),
            search: jest.fn().mockResolvedValue(['searched']),
            updateClient: jest.fn().mockResolvedValue(true),
            findAllMasked: jest.fn().mockResolvedValue(['masked']),
            findOneMasked: jest.fn().mockResolvedValue('oneMasked'),
            findAll: jest.fn().mockResolvedValue(['all']),
            getPersonaPool: jest.fn().mockResolvedValue('pool'),
            getExistingAssignments: jest.fn().mockResolvedValue('assignments'),
            findOne: jest.fn().mockResolvedValue('one'),
            update: jest.fn().mockResolvedValue('updated'),
            remove: jest.fn().mockResolvedValue('removed'),
            executeQuery: jest.fn().mockResolvedValue(['queried']),
        };
        controller = new ClientController(stub as any);
    });

    it('create delegates', async () => {
        const dto: any = { clientId: 'c1' };
        await expect(controller.create(dto)).resolves.toBe('created');
        expect(stub.create).toHaveBeenCalledWith(dto);
    });

    it('search strips apiKey before delegating', async () => {
        const query: any = { name: 'foo', apiKey: 'secret' };
        await expect(controller.search(query)).resolves.toEqual(['searched']);
        expect(stub.search).toHaveBeenCalledWith({ name: 'foo' });
        const passed = stub.search.mock.calls[0][0];
        expect(passed.apiKey).toBeUndefined();
    });

    describe('updateClient', () => {
        it('returns completed when truthy', async () => {
            stub.updateClient.mockResolvedValueOnce(true);
            await expect(controller.updateClient('c1')).resolves.toBe('Update client completed');
            expect(stub.updateClient).toHaveBeenCalledWith('c1', '', false, true);
        });

        it('returns skipped when falsy', async () => {
            stub.updateClient.mockResolvedValueOnce(false);
            await expect(controller.updateClient('c1')).resolves.toBe('Update client skipped');
        });
    });

    it('findAllMasked delegates', async () => {
        await expect(controller.findAllMasked()).resolves.toEqual(['masked']);
        expect(stub.findAllMasked).toHaveBeenCalledTimes(1);
    });

    it('findOneMasked delegates', async () => {
        await expect(controller.findOneMasked('c1')).resolves.toBe('oneMasked');
        expect(stub.findOneMasked).toHaveBeenCalledWith('c1');
    });

    it('findAll delegates', async () => {
        await expect(controller.findAll()).resolves.toEqual(['all']);
        expect(stub.findAll).toHaveBeenCalledTimes(1);
    });

    it('getPersonaPool delegates', async () => {
        await expect(controller.getPersonaPool('c1')).resolves.toBe('pool');
        expect(stub.getPersonaPool).toHaveBeenCalledWith('c1');
    });

    describe('getExistingAssignments', () => {
        it('defaults scope to all', async () => {
            await controller.getExistingAssignments('c1', undefined as any);
            expect(stub.getExistingAssignments).toHaveBeenCalledWith('c1', 'all');
        });

        it('passes explicit scope', async () => {
            await controller.getExistingAssignments('c1', 'buffer');
            expect(stub.getExistingAssignments).toHaveBeenCalledWith('c1', 'buffer');
        });
    });

    it('findOne delegates', async () => {
        await expect(controller.findOne('c1')).resolves.toBe('one');
        expect(stub.findOne).toHaveBeenCalledWith('c1');
    });

    it('update delegates with clientId and dto', async () => {
        const dto: any = { name: 'x' };
        await expect(controller.update('c1', dto)).resolves.toBe('updated');
        expect(stub.update).toHaveBeenCalledWith('c1', dto);
    });

    it('remove delegates', async () => {
        await expect(controller.remove('c1')).resolves.toBe('removed');
        expect(stub.remove).toHaveBeenCalledWith('c1');
    });

    it('executeQuery destructures and delegates', async () => {
        const body: any = { query: { a: 1 }, sort: { b: -1 }, limit: 10, skip: 5, extra: 'ignored' };
        await expect(controller.executeQuery(body)).resolves.toEqual(['queried']);
        expect(stub.executeQuery).toHaveBeenCalledWith({ a: 1 }, { b: -1 }, 10, 5);
    });
});

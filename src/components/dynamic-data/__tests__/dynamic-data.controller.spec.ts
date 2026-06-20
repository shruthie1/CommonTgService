import { DynamicDataController } from '../dynamic-data.controller';

describe('DynamicDataController', () => {
    const svc = {
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
    };
    const controller = new DynamicDataController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('create delegates', async () => {
        svc.create.mockResolvedValue({ ok: 1 });
        const dto = { configKey: 'k', data: { a: 1 } } as any;
        expect(await controller.create(dto)).toEqual({ ok: 1 });
        expect(svc.create).toHaveBeenCalledWith(dto);
    });

    test('findAll delegates', async () => {
        svc.findAll.mockResolvedValue({ k: { a: 1 } });
        expect(await controller.findAll()).toEqual({ k: { a: 1 } });
        expect(svc.findAll).toHaveBeenCalled();
    });

    test('findOne delegates with path', async () => {
        svc.findOne.mockResolvedValue('value');
        expect(await controller.findOne('k', { path: 'a.b' } as any)).toBe('value');
        expect(svc.findOne).toHaveBeenCalledWith('k', 'a.b');
    });

    test('findOne delegates without path', async () => {
        svc.findOne.mockResolvedValue({ a: 1 });
        expect(await controller.findOne('k', {} as any)).toEqual({ a: 1 });
        expect(svc.findOne).toHaveBeenCalledWith('k', undefined);
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ updated: true });
        const dto = { value: 5 } as any;
        expect(await controller.update('k', dto)).toEqual({ updated: true });
        expect(svc.update).toHaveBeenCalledWith('k', dto);
    });

    test('remove delegates and returns void', async () => {
        svc.remove.mockResolvedValue(undefined);
        expect(await controller.remove('k', { path: 'a' } as any)).toBeUndefined();
        expect(svc.remove).toHaveBeenCalledWith('k', 'a');
    });
});

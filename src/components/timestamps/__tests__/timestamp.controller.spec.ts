import { TimestampController } from '../timestamp.controller';

describe('TimestampController', () => {
    let service: any;
    let controller: TimestampController;

    beforeEach(() => {
        service = {
            findOne: jest.fn().mockResolvedValue({ clientA: 1 }),
            getClientsWithTimeDifference: jest.fn().mockResolvedValue(['url']),
            update: jest.fn().mockResolvedValue({ clientA: 2 }),
        };
        controller = new TimestampController(service);
    });

    it('findOne delegates', async () => {
        await expect(controller.findOne()).resolves.toEqual({ clientA: 1 });
        expect(service.findOne).toHaveBeenCalled();
    });

    it('getClientsWithTimeDifference converts minutes to ms when provided', async () => {
        await controller.getClientsWithTimeDifference(5);
        expect(service.getClientsWithTimeDifference).toHaveBeenCalledWith(5 * 60 * 1000);
    });

    it('getClientsWithTimeDifference uses default 3 min when not provided', async () => {
        await controller.getClientsWithTimeDifference();
        expect(service.getClientsWithTimeDifference).toHaveBeenCalledWith(3 * 60 * 1000);
    });

    it('update delegates', async () => {
        const dto = { clientA: 2 };
        await expect(controller.update(dto)).resolves.toEqual({ clientA: 2 });
        expect(service.update).toHaveBeenCalledWith(dto);
    });
});

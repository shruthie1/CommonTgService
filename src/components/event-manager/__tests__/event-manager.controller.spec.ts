import { EventManagerController } from '../event-manager.controller';

function makeServiceStub() {
    return {
        getEvents: jest.fn(),
        getEventById: jest.fn(),
        create: jest.fn(),
        schedulePaidEvents: jest.fn(),
        createMultiple: jest.fn(),
        deleteMultiple: jest.fn(),
    };
}

describe('EventManagerController', () => {
    let stub: ReturnType<typeof makeServiceStub>;
    let controller: EventManagerController;

    beforeEach(() => {
        stub = makeServiceStub();
        controller = new EventManagerController(stub as any);
    });

    it('getAllEvents returns { data }', async () => {
        stub.getEvents.mockResolvedValue([{ a: 1 }]);
        expect(await controller.getAllEvents({ chatId: '1' })).toEqual({ data: [{ a: 1 }] });
        expect(stub.getEvents).toHaveBeenCalledWith({ chatId: '1' });
    });

    it('getEventById returns { data }', async () => {
        stub.getEventById.mockResolvedValue({ _id: 'x' });
        expect(await controller.getEventById('x')).toEqual({ data: { _id: 'x' } });
        expect(stub.getEventById).toHaveBeenCalledWith('x');
    });

    it('createEvent returns { data }', async () => {
        stub.create.mockResolvedValue({ _id: 'e1' });
        const dto: any = { chatId: '1', type: 'call', profile: 'p', time: 1 };
        expect(await controller.createEvent(dto)).toEqual({ data: { _id: 'e1' } });
        expect(stub.create).toHaveBeenCalledWith(dto);
    });

    it('schedulePaidEvents passes chatId/profile/type', async () => {
        stub.schedulePaidEvents.mockResolvedValue({ message: 'ok' });
        const dto: any = { chatId: 'c1', profile: 'pr', type: '2' };
        expect(await controller.schedulePaidEvents(dto)).toEqual({ data: { message: 'ok' } });
        expect(stub.schedulePaidEvents).toHaveBeenCalledWith('c1', 'pr', '2');
    });

    it('createMultiple returns { data }', async () => {
        stub.createMultiple.mockResolvedValue([{ _id: 'm1' }]);
        const events: any = [{ chatId: '1' }];
        expect(await controller.createMultiple(events)).toEqual({ data: [{ _id: 'm1' }] });
        expect(stub.createMultiple).toHaveBeenCalledWith(events);
    });

    it('deleteMultiple returns status + entriesDeleted', async () => {
        stub.deleteMultiple.mockResolvedValue(3);
        expect(await controller.deleteMultiple('c1')).toEqual({
            status: 'Deleted Sucessfully',
            entriesDeleted: 3,
        });
        expect(stub.deleteMultiple).toHaveBeenCalledWith('c1');
    });
});

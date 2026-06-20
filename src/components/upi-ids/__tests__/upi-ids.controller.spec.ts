import { UpiIdController } from '../upi-ids.controller';

describe('UpiIdController', () => {
  let service: any;
  let controller: UpiIdController;

  beforeEach(() => {
    service = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    controller = new UpiIdController(service);
  });

  it('findOne delegates to service.findOne', async () => {
    service.findOne.mockResolvedValue({ gpay: 'g@upi' });
    const res = await controller.findOne();
    expect(service.findOne).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ gpay: 'g@upi' });
  });

  it('update delegates to service.update with body', async () => {
    const body = { gpay: 'new@upi' };
    service.update.mockResolvedValue(body);
    const res = await controller.update(body);
    expect(service.update).toHaveBeenCalledWith(body);
    expect(res).toEqual(body);
  });
});

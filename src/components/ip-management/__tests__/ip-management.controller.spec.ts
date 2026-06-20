import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { IpManagementController } from '../ip-management.controller';

describe('IpManagementController', () => {
    let service: any;
    let controller: IpManagementController;

    beforeEach(() => {
        service = {
            createProxyIp: jest.fn(),
            bulkCreateProxyIps: jest.fn(),
            findAllProxyIps: jest.fn(),
            getNextIp: jest.fn(),
            updateProxyIp: jest.fn(),
            deleteProxyIp: jest.fn(),
            healthCheck: jest.fn(),
            getStats: jest.fn(),
            findProxyIpById: jest.fn(),
            getClientAssignedIps: jest.fn(),
            getAvailableIpCount: jest.fn(),
        };
        controller = new IpManagementController(service);
    });

    const expectHttp = async (p: Promise<any>, status: HttpStatus) => {
        await expect(p).rejects.toBeInstanceOf(HttpException);
        await p.catch((e: HttpException) => expect(e.getStatus()).toBe(status));
    };

    // createProxyIp
    it('createProxyIp success', async () => {
        service.createProxyIp.mockResolvedValue({ ipAddress: 'a' });
        expect(await controller.createProxyIp({} as any)).toEqual({ ipAddress: 'a' });
    });
    it('createProxyIp error -> 400', async () => {
        service.createProxyIp.mockRejectedValue(new Error('bad'));
        await expectHttp(controller.createProxyIp({} as any), HttpStatus.BAD_REQUEST);
    });

    // bulkCreateProxyIps
    it('bulkCreateProxyIps success', async () => {
        service.bulkCreateProxyIps.mockResolvedValue({ created: 1, failed: 0, errors: [] });
        expect(await controller.bulkCreateProxyIps([] as any)).toEqual({ created: 1, failed: 0, errors: [] });
    });
    it('bulkCreateProxyIps error -> 400', async () => {
        service.bulkCreateProxyIps.mockRejectedValue(new Error('bad'));
        await expectHttp(controller.bulkCreateProxyIps([] as any), HttpStatus.BAD_REQUEST);
    });

    // getAllProxyIps
    it('getAllProxyIps success', async () => {
        service.findAllProxyIps.mockResolvedValue([{ ipAddress: 'a' }]);
        expect(await controller.getAllProxyIps()).toEqual([{ ipAddress: 'a' }]);
    });
    it('getAllProxyIps error -> 500', async () => {
        service.findAllProxyIps.mockRejectedValue(new Error('boom'));
        await expectHttp(controller.getAllProxyIps(), HttpStatus.INTERNAL_SERVER_ERROR);
    });

    // getNextIp
    it('getNextIp success', async () => {
        service.getNextIp.mockResolvedValue({ ipAddress: 'a' });
        expect(await controller.getNextIp({} as any)).toEqual({ ipAddress: 'a' });
    });
    it('getNextIp rethrows HttpException as-is', async () => {
        const original = new NotFoundException('none');
        service.getNextIp.mockRejectedValue(original);
        await expect(controller.getNextIp({} as any)).rejects.toBe(original);
    });
    it('getNextIp generic error -> 404', async () => {
        service.getNextIp.mockRejectedValue(new Error('oops'));
        await expectHttp(controller.getNextIp({} as any), HttpStatus.NOT_FOUND);
    });

    // updateProxyIp
    it('updateProxyIp success parses port', async () => {
        service.updateProxyIp.mockResolvedValue({ ipAddress: 'a' });
        await controller.updateProxyIp('1.1.1.1', '8080', {} as any);
        expect(service.updateProxyIp).toHaveBeenCalledWith('1.1.1.1', 8080, {});
    });
    it('updateProxyIp error -> 400', async () => {
        service.updateProxyIp.mockRejectedValue(new Error('bad'));
        await expectHttp(controller.updateProxyIp('1.1.1.1', '80', {} as any), HttpStatus.BAD_REQUEST);
    });

    // deleteProxyIp
    it('deleteProxyIp success returns message', async () => {
        service.deleteProxyIp.mockResolvedValue(undefined);
        expect(await controller.deleteProxyIp('1.1.1.1', '80')).toEqual({ message: 'Proxy IP deleted successfully' });
        expect(service.deleteProxyIp).toHaveBeenCalledWith('1.1.1.1', 80);
    });
    it('deleteProxyIp error -> 400', async () => {
        service.deleteProxyIp.mockRejectedValue(new Error('bad'));
        await expectHttp(controller.deleteProxyIp('1.1.1.1', '80'), HttpStatus.BAD_REQUEST);
    });

    // getHealthStatus
    it('getHealthStatus success', async () => {
        service.healthCheck.mockResolvedValue({ status: 'healthy' });
        expect(await controller.getHealthStatus()).toEqual({ status: 'healthy' });
    });
    it('getHealthStatus error -> 500', async () => {
        service.healthCheck.mockRejectedValue(new Error('boom'));
        await expectHttp(controller.getHealthStatus(), HttpStatus.INTERNAL_SERVER_ERROR);
    });

    // getStats
    it('getStats success', async () => {
        service.getStats.mockResolvedValue({ total: 1 });
        expect(await controller.getStats()).toEqual({ total: 1 });
    });
    it('getStats error -> 500', async () => {
        service.getStats.mockRejectedValue(new Error('boom'));
        await expectHttp(controller.getStats(), HttpStatus.INTERNAL_SERVER_ERROR);
    });

    // getProxyIpById
    it('getProxyIpById success parses port', async () => {
        service.findProxyIpById.mockResolvedValue({ ipAddress: 'a' });
        expect(await controller.getProxyIpById('1.1.1.1', '80')).toEqual({ ipAddress: 'a' });
        expect(service.findProxyIpById).toHaveBeenCalledWith('1.1.1.1', 80);
    });
    it('getProxyIpById error -> 404', async () => {
        service.findProxyIpById.mockRejectedValue(new Error('nope'));
        await expectHttp(controller.getProxyIpById('1.1.1.1', '80'), HttpStatus.NOT_FOUND);
    });

    // getClientAssignedIps
    it('getClientAssignedIps success', async () => {
        service.getClientAssignedIps.mockResolvedValue([{ ipAddress: 'a' }]);
        expect(await controller.getClientAssignedIps('c1')).toEqual([{ ipAddress: 'a' }]);
    });
    it('getClientAssignedIps error -> 400', async () => {
        service.getClientAssignedIps.mockRejectedValue(new Error('bad'));
        await expectHttp(controller.getClientAssignedIps('c1'), HttpStatus.BAD_REQUEST);
    });

    // getAvailableIpCount
    it('getAvailableIpCount success wraps count', async () => {
        service.getAvailableIpCount.mockResolvedValue(7);
        expect(await controller.getAvailableIpCount()).toEqual({ count: 7 });
    });
    it('getAvailableIpCount error -> 500', async () => {
        service.getAvailableIpCount.mockRejectedValue(new Error('boom'));
        await expectHttp(controller.getAvailableIpCount(), HttpStatus.INTERNAL_SERVER_ERROR);
    });
});

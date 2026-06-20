import { NotFoundException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { startMongo, stopMongo, MongoTestContext } from '../../__tests__/api-test-helpers';

// Mock the network helper (true external) before importing the service.
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn().mockResolvedValue(undefined),
}));

import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { ConfigurationService } from '../init.service';
import { ConfigurationController } from '../init.controller';
import { ConfigurationSchema, Configuration } from '../configuration.schema';

const mockConfigService = (value?: any) => ({ get: jest.fn(() => value) } as any);

describe('ConfigurationService (real Mongo)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let model: Model<Configuration>;

    beforeAll(async () => {
        ctx = await startMongo('config-init-svc-test');
        connection = ctx.connection;
        model = connection.model<Configuration>('ConfigurationGroupB', ConfigurationSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the static "initialized" flag so each onModuleInit test runs fresh.
        (ConfigurationService as any).initialized = false;
        // notifbot() (used inside notifyStart) throws unless BOT_TOKENS is configured.
        process.env.BOT_TOKENS = 'token-a,token-b';
    });

    afterEach(async () => {
        await model.deleteMany({}).exec();
        delete process.env.BOT_TOKENS;
    });

    function makeService(configService = mockConfigService()) {
        return new ConfigurationService(model, configService);
    }

    test('findOne throws NotFound when empty', async () => {
        await expect(makeService().findOne()).rejects.toBeInstanceOf(NotFoundException);
    });

    test('update upserts and returns the configuration, stripping _id', async () => {
        const service = makeService();
        const result = await service.update({ FOO_KEY_TEST: 'bar', _id: 'strip' } as any);
        expect((result as any).FOO_KEY_TEST).toBe('bar');
        expect(process.env.FOO_KEY_TEST).toBe('bar');
        delete process.env.FOO_KEY_TEST;
    });

    test('update skips null/undefined values when syncing env', async () => {
        const service = makeService();
        const result = await service.update({ NULL_KEY_TEST: null, REAL_KEY_TEST: 'x' } as any);
        expect((result as any).REAL_KEY_TEST).toBe('x');
        expect(process.env.NULL_KEY_TEST).toBeUndefined();
        delete process.env.REAL_KEY_TEST;
    });

    test('findOne returns the configuration when present', async () => {
        const service = makeService();
        await service.update({ SOME_CFG: 'val' } as any);
        const found = await service.findOne();
        expect((found as any).SOME_CFG).toBe('val');
    });

    test('update rethrows on model error', async () => {
        const service = makeService();
        jest.spyOn(model, 'findOneAndUpdate').mockImplementationOnce(() => {
            throw new Error('db down');
        });
        await expect(service.update({ x: 1 } as any)).rejects.toThrow('db down');
    });

    test('setEnv warns and returns when no configuration found', async () => {
        const service = makeService();
        await expect(service.setEnv()).resolves.toBeUndefined();
    });

    test('setEnv sets only env vars that are not already present', async () => {
        const service = makeService();
        await model.create({ NEW_ENV_KEY: 'fresh', EXISTING_ENV_KEY: 'fromdb' } as any);
        process.env.EXISTING_ENV_KEY = 'preset';
        await service.setEnv();
        expect(process.env.NEW_ENV_KEY).toBe('fresh');
        expect(process.env.EXISTING_ENV_KEY).toBe('preset');
        delete process.env.NEW_ENV_KEY;
        delete process.env.EXISTING_ENV_KEY;
    });

    test('setEnv JSON-serializes object/array config values (not "[object Object]")', async () => {
        // A non-primitive config field would otherwise become "[object Object]" via String(value),
        // corrupting any consumer that JSON.parses it.
        const service = makeService();
        await model.create({ OBJ_CFG_TEST: { a: 1, b: ['x'] } } as any);
        await service.setEnv();
        expect(process.env.OBJ_CFG_TEST).toBe('{"a":1,"b":["x"]}');
        expect(JSON.parse(process.env.OBJ_CFG_TEST!)).toEqual({ a: 1, b: ['x'] });
        delete process.env.OBJ_CFG_TEST;
    });

    test('setEnv does not leak Mongo timestamp fields into process.env', async () => {
        const service = makeService();
        await model.create({ TS_CFG_TEST: 'v' } as any); // schema has timestamps:true
        await service.setEnv();
        // createdAt/updatedAt are storage metadata, not config — must not become env vars.
        expect(process.env.createdAt).toBeUndefined();
        expect(process.env.updatedAt).toBeUndefined();
        delete process.env.TS_CFG_TEST;
    });

    test('onModuleInit runs init flow and sends notification with clientId from env', async () => {
        process.env.clientId = 'env-client';
        const service = makeService();
        await service.onModuleInit();
        expect(fetchWithTimeout).toHaveBeenCalled();
        delete process.env.clientId;
    });

    test('onModuleInit short-circuits when already initialized', async () => {
        (ConfigurationService as any).initialized = true;
        const service = makeService();
        await service.onModuleInit();
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test('notifyStart warns when no clientId resolved (no fetch)', async () => {
        delete process.env.clientId;
        const service = makeService(mockConfigService(undefined));
        await service.onModuleInit();
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test('notifyStart resolves clientId from ConfigService when env missing', async () => {
        delete process.env.clientId;
        const service = makeService(mockConfigService('cfg-client'));
        await service.onModuleInit();
        expect(fetchWithTimeout).toHaveBeenCalled();
    });

    test('onModuleInit rethrows and logs when init flow fails', async () => {
        const service = makeService();
        jest.spyOn(service as any, 'setEnv').mockRejectedValueOnce(new Error('boom'));
        await expect(service.onModuleInit()).rejects.toThrow('boom');
    });

    test('notifyStart swallows fetch errors', async () => {
        process.env.clientId = 'env-client';
        (fetchWithTimeout as jest.Mock).mockRejectedValueOnce(new Error('network'));
        const service = makeService();
        // notifyStart catches the error; onModuleInit should still resolve.
        await expect(service.onModuleInit()).resolves.toBeUndefined();
        delete process.env.clientId;
    });
});

describe('ConfigurationController', () => {
    const svc = { findOne: jest.fn(), update: jest.fn() };
    const controller = new ConfigurationController(svc as any);

    afterEach(() => jest.clearAllMocks());

    test('findOne delegates', async () => {
        svc.findOne.mockResolvedValue({ a: 1 });
        expect(await controller.findOne()).toEqual({ a: 1 });
        expect(svc.findOne).toHaveBeenCalled();
    });

    test('update delegates', async () => {
        svc.update.mockResolvedValue({ b: 2 });
        expect(await controller.update({ b: 2 })).toEqual({ b: 2 });
        expect(svc.update).toHaveBeenCalledWith({ b: 2 });
    });
});

/**
 * Shared test helpers for entity API integration tests.
 *
 * Uses mongodb-memory-server for a real MongoDB, but mocks all external
 * dependencies (Telegram, bots, connection manager, etc.).
 * This means our service logic + MongoDB interactions are tested for real.
 */
import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClient, BufferClientSchema } from '../buffer-clients/schemas/buffer-client.schema';
import { PromoteClient, PromoteClientSchema } from '../promote-clients/schemas/promote-client.schema';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { User, UserDocument, UserSchema } from '../users/schemas/user.schema';

// ─── MongoDB memory server lifecycle ────────────────────────────────────────

export interface MongoTestContext {
    mongod: MongoMemoryServer;
    connection: Connection;
}

export async function startMongo(dbName: string): Promise<MongoTestContext> {
    const mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose.createConnection(mongod.getUri(), { dbName }).asPromise();
    return { mongod, connection };
}

export async function stopMongo(ctx: MongoTestContext): Promise<void> {
    if (ctx.connection) {
        await ctx.connection.dropDatabase();
        await ctx.connection.close();
    }
    if (ctx.mongod) await ctx.mongod.stop();
}

// ─── Model factories ────────────────────────────────────────────────────────

export function createBufferClientModel(connection: Connection): Model<BufferClient> {
    const model = connection.model<BufferClient>('BufferClientApiTest', BufferClientSchema);
    return model;
}

export function createPromoteClientModel(connection: Connection): Model<PromoteClient> {
    const model = connection.model<PromoteClient>('PromoteClientApiTest', PromoteClientSchema);
    return model;
}

export function createClientModel(connection: Connection): Model<Client> {
    const model = connection.model<Client>('ClientApiTest', ClientSchema);
    return model;
}

export function createUserModel(connection: Connection): Model<UserDocument> {
    const model = connection.model<UserDocument>('UserApiTest', UserSchema);
    return model;
}

// ─── Mock factories ─────────────────────────────────────────────────────────

export function mockBotsService() {
    return {
        sendMessageByCategory: jest.fn().mockResolvedValue(undefined),
    };
}

export function mockTelegramService() {
    return {
        hasActiveClientSetup: jest.fn(() => false),
        getActiveClientSetup: jest.fn(() => null),
        clearActiveClientSetup: jest.fn(),
        createNewSession: jest.fn(async (mobile: string) => `new-session-${mobile}`),
        getChannelInfo: jest.fn(async () => ({ ids: [], count: 0 })),
    };
}

export function mockUsersService() {
    return {
        search: jest.fn(async () => []),
        update: jest.fn(async () => 1),
    };
}

export function mockClientService(clients: any[] = []) {
    return {
        findAll: jest.fn(async () => clients),
        findOne: jest.fn(async (clientId: string) => clients.find(c => c.clientId === clientId) || null),
    };
}

export function mockActiveChannelsService() {
    return {
        getActiveChannels: jest.fn().mockResolvedValue([]),
    };
}

export function mockChannelsService() {
    return {
        findAll: jest.fn().mockResolvedValue([]),
    };
}

export function mockSessionService() {
    return {};
}

// ─── Test data factories ────────────────────────────────────────────────────

let counter = 0;

export function makeBufferClientData(overrides: Partial<BufferClient> = {}): any {
    counter++;
    return {
        tgId: `tg-buf-${counter}`,
        mobile: `+155500${String(counter).padStart(5, '0')}`,
        session: `session-buf-${counter}`,
        availableDate: '2026-04-01',
        channels: 100,
        clientId: 'test-client-1',
        ...overrides,
    };
}

export function makePromoteClientData(overrides: Partial<PromoteClient> = {}): any {
    counter++;
    return {
        tgId: `tg-prom-${counter}`,
        mobile: `+155510${String(counter).padStart(5, '0')}`,
        lastActive: '2026-04-01',
        availableDate: '2026-04-01',
        channels: 150,
        clientId: 'test-client-1',
        ...overrides,
    };
}

export function makeClientData(overrides: Partial<Client> = {}): any {
    counter++;
    return {
        channelLink: `test-channel-${counter}`,
        dbcoll: `test-db-${counter}`,
        link: `https://example.com/link-${counter}`,
        name: `Test Client ${counter}`,
        mobile: `+155520${String(counter).padStart(5, '0')}`,
        password: 'testpass123',
        repl: `https://example.com/repl-${counter}`,
        promoteRepl: `https://example.com/promote-${counter}`,
        session: `session-client-${counter}`,
        username: `testuser_${counter}`,
        clientId: `test-client-${counter}`,
        deployKey: `https://example.com/deploy-${counter}`,
        product: 'test-product',
        qrId: `qr-${counter}`,
        gpayId: `gpay-${counter}`,
        ...overrides,
    };
}

export function makeUserData(overrides: Partial<User> = {}): any {
    counter++;
    return {
        mobile: `+155530${String(counter).padStart(5, '0')}`,
        session: `session-user-${counter}`,
        tgId: `tg-user-${counter}`,
        firstName: `User${counter}`,
        lastName: `Last${counter}`,
        username: `user_${counter}`,
        gender: null,
        twoFA: false,
        expired: false,
        password: null,
        channels: 10,
        personalChats: 5,
        totalChats: 15,
        contacts: 3,
        msgs: 50,
        photoCount: 2,
        videoCount: 1,
        movieCount: 0,
        ownPhotoCount: 1,
        otherPhotoCount: 1,
        ownVideoCount: 0,
        otherVideoCount: 1,
        lastActive: '2026-04-01',
        ...overrides,
    };
}

export function resetCounter(): void {
    counter = 0;
}

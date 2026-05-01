"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMongo = startMongo;
exports.stopMongo = stopMongo;
exports.createBufferClientModel = createBufferClientModel;
exports.createPromoteClientModel = createPromoteClientModel;
exports.createClientModel = createClientModel;
exports.createUserModel = createUserModel;
exports.mockBotsService = mockBotsService;
exports.mockTelegramService = mockTelegramService;
exports.mockUsersService = mockUsersService;
exports.mockClientService = mockClientService;
exports.mockActiveChannelsService = mockActiveChannelsService;
exports.mockChannelsService = mockChannelsService;
exports.mockSessionService = mockSessionService;
exports.makeBufferClientData = makeBufferClientData;
exports.makePromoteClientData = makePromoteClientData;
exports.makeClientData = makeClientData;
exports.makeUserData = makeUserData;
exports.resetCounter = resetCounter;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const buffer_client_schema_1 = require("../buffer-clients/schemas/buffer-client.schema");
const promote_client_schema_1 = require("../promote-clients/schemas/promote-client.schema");
const client_schema_1 = require("../clients/schemas/client.schema");
const user_schema_1 = require("../users/schemas/user.schema");
async function startMongo(dbName) {
    const mongod = await mongodb_memory_server_1.MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    const connection = await mongoose_1.default.createConnection(mongod.getUri(), { dbName }).asPromise();
    return { mongod, connection };
}
async function stopMongo(ctx) {
    if (ctx.connection) {
        await ctx.connection.dropDatabase();
        await ctx.connection.close();
    }
    if (ctx.mongod)
        await ctx.mongod.stop();
}
function createBufferClientModel(connection) {
    const model = connection.model('BufferClientApiTest', buffer_client_schema_1.BufferClientSchema);
    return model;
}
function createPromoteClientModel(connection) {
    const model = connection.model('PromoteClientApiTest', promote_client_schema_1.PromoteClientSchema);
    return model;
}
function createClientModel(connection) {
    const model = connection.model('ClientApiTest', client_schema_1.ClientSchema);
    return model;
}
function createUserModel(connection) {
    const model = connection.model('UserApiTest', user_schema_1.UserSchema);
    return model;
}
function mockBotsService() {
    return {
        sendMessageByCategory: jest.fn().mockResolvedValue(undefined),
    };
}
function mockTelegramService() {
    return {
        hasActiveClientSetup: jest.fn(() => false),
        getActiveClientSetup: jest.fn(() => null),
        clearActiveClientSetup: jest.fn(),
        createNewSession: jest.fn(async (mobile) => `new-session-${mobile}`),
        getChannelInfo: jest.fn(async () => ({ ids: [], count: 0 })),
    };
}
function mockUsersService() {
    return {
        search: jest.fn(async () => []),
        update: jest.fn(async () => 1),
    };
}
function mockClientService(clients = []) {
    return {
        findAll: jest.fn(async () => clients),
        findOne: jest.fn(async (clientId) => clients.find(c => c.clientId === clientId) || null),
    };
}
function mockActiveChannelsService() {
    return {
        getActiveChannels: jest.fn().mockResolvedValue([]),
    };
}
function mockChannelsService() {
    return {
        findAll: jest.fn().mockResolvedValue([]),
    };
}
function mockSessionService() {
    return {};
}
let counter = 0;
function makeBufferClientData(overrides = {}) {
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
function makePromoteClientData(overrides = {}) {
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
function makeClientData(overrides = {}) {
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
function makeUserData(overrides = {}) {
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
function resetCounter() {
    counter = 0;
}
//# sourceMappingURL=api-test-helpers.js.map
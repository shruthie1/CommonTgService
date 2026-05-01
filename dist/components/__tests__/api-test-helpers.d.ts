import { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClient } from '../buffer-clients/schemas/buffer-client.schema';
import { PromoteClient } from '../promote-clients/schemas/promote-client.schema';
import { Client } from '../clients/schemas/client.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
export interface MongoTestContext {
    mongod: MongoMemoryServer;
    connection: Connection;
}
export declare function startMongo(dbName: string): Promise<MongoTestContext>;
export declare function stopMongo(ctx: MongoTestContext): Promise<void>;
export declare function createBufferClientModel(connection: Connection): Model<BufferClient>;
export declare function createPromoteClientModel(connection: Connection): Model<PromoteClient>;
export declare function createClientModel(connection: Connection): Model<Client>;
export declare function createUserModel(connection: Connection): Model<UserDocument>;
export declare function mockBotsService(): {
    sendMessageByCategory: jest.Mock<any, any, any>;
};
export declare function mockTelegramService(): {
    hasActiveClientSetup: jest.Mock<boolean, [], any>;
    getActiveClientSetup: jest.Mock<any, [], any>;
    clearActiveClientSetup: jest.Mock<any, any, any>;
    createNewSession: jest.Mock<Promise<string>, [mobile: string], any>;
    getChannelInfo: jest.Mock<Promise<{
        ids: any[];
        count: number;
    }>, [], any>;
};
export declare function mockUsersService(): {
    search: jest.Mock<Promise<any[]>, [], any>;
    update: jest.Mock<Promise<number>, [], any>;
};
export declare function mockClientService(clients?: any[]): {
    findAll: jest.Mock<Promise<any[]>, [], any>;
    findOne: jest.Mock<Promise<any>, [clientId: string], any>;
};
export declare function mockActiveChannelsService(): {
    getActiveChannels: jest.Mock<any, any, any>;
};
export declare function mockChannelsService(): {
    findAll: jest.Mock<any, any, any>;
};
export declare function mockSessionService(): {};
export declare function makeBufferClientData(overrides?: Partial<BufferClient>): any;
export declare function makePromoteClientData(overrides?: Partial<PromoteClient>): any;
export declare function makeClientData(overrides?: Partial<Client>): any;
export declare function makeUserData(overrides?: Partial<User>): any;
export declare function resetCounter(): void;

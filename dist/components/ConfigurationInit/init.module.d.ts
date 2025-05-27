import { OnModuleDestroy, OnModuleInit, DynamicModule } from '@nestjs/common';
import { Connection } from 'mongoose';
export declare class initModule implements OnModuleDestroy, OnModuleInit {
    private readonly connection;
    constructor(connection: Connection);
    static forRoot(): DynamicModule;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private closeConnection;
}

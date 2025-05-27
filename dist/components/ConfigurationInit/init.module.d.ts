import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Connection } from 'mongoose';
export declare class initModule implements OnModuleDestroy, OnModuleInit {
    private readonly connection;
    constructor(connection: Connection);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private closeConnection;
}

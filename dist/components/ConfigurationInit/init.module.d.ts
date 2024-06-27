import { OnModuleDestroy } from '@nestjs/common';
import { Connection } from 'mongoose';
export declare class initModule implements OnModuleDestroy {
    private readonly connection;
    constructor(connection: Connection);
    onModuleDestroy(): void;
    private closeConnection;
}

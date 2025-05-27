import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
export declare class InitModule implements OnModuleDestroy, OnModuleInit {
    private readonly connection;
    private readonly configService;
    private static initializationStatus;
    private connectionHealthCheckInterval?;
    private readonly HEALTH_CHECK_INTERVAL;
    constructor(connection: Connection, configService: ConfigService);
    onModuleInit(): Promise<void>;
    private validateConnection;
    private setupConnectionEventHandlers;
    private startHealthCheck;
    private stopHealthCheck;
    private sendNotification;
    private delay;
    onModuleDestroy(): Promise<void>;
    static getInitializationStatus(): {
        isInitialized: boolean;
        isInitializing: boolean;
        isDestroying: boolean;
    };
    static isReady(): boolean;
}

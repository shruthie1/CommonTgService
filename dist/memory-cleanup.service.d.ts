import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class MemoryCleanerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private intervalId;
    private readonly memoryLimitMB;
    private readonly cleanupIntervalMs;
    onModuleInit(): void;
    onModuleDestroy(): void;
    private getMemoryUsageInMB;
    private monitorAndCleanup;
    cleanupMemory(): void;
}

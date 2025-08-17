import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import { NpointService } from '../n-point/npoint.service';
export declare class UpiIdService implements OnModuleDestroy, OnModuleInit {
    private readonly upiIdModel;
    private readonly npointService;
    private readonly logger;
    private checkInterval;
    private upiIds;
    private isInitialized;
    private readonly REFRESH_INTERVAL;
    private readonly MAX_RETRIES;
    private readonly RETRY_DELAY;
    constructor(upiIdModel: Model<UpiId>, npointService: NpointService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    private initializeService;
    private startPeriodicCheck;
    refreshUPIs(): Promise<void>;
    checkNpoint(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
    private executeWithRetry;
    private sleep;
    getServiceStatus(): {
        isInitialized: boolean;
        hasCachedData: boolean;
        lastUpdate?: Date;
    };
}

import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import { NpointService } from '../n-point/npoint.service';
export declare class UpiIdService implements OnModuleDestroy, OnModuleInit {
    private UpiIdModel;
    private npointSerive;
    private checkInterval;
    private upiIds;
    constructor(UpiIdModel: Model<UpiId>, npointSerive: NpointService);
    onModuleDestroy(): void;
    onModuleInit(): void;
    refreshUPIs(): Promise<void>;
    checkNpoint(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

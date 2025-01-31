import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
import { NpointService } from '../n-point/npoint.service';
export declare class UpiIdService {
    private UpiIdModel;
    private npointSerive;
    private upiIds;
    constructor(UpiIdModel: Model<UpiId>, npointSerive: NpointService);
    OnModuleInit(): Promise<void>;
    refreshUPIs(): Promise<void>;
    checkNpoint(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
export declare class UpiIdService {
    private UpiIdModel;
    private upiIds;
    constructor(UpiIdModel: Model<UpiId>);
    OnModuleInit(): Promise<void>;
    refreshUPIs(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

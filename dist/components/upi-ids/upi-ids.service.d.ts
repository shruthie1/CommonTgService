import { Model } from 'mongoose';
import { UpiId } from './upi-ids.schema';
export declare class UpiIdService {
    private UpiIdModel;
    constructor(UpiIdModel: Model<UpiId>);
    OnModuleInit(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

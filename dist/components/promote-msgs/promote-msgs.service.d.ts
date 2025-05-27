import { Model } from 'mongoose';
import { PromoteMsg } from './promote-msgs.schema';
export declare class PromoteMsgsService {
    private promotemsgModel;
    constructor(promotemsgModel: Model<PromoteMsg>);
    OnModuleInit(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

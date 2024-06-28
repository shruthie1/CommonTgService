import { Model } from 'mongoose';
import { Build } from './builds.schema';
export declare class BuildService {
    private buildModel;
    constructor(buildModel: Model<Build>);
    OnModuleInit(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

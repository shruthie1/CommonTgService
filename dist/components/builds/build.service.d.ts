import { Model } from 'mongoose';
import { Build } from './builds.schema';
import { NpointService } from '../n-point/npoint.service';
export declare class BuildService {
    private buildModel;
    private npointSerive;
    constructor(buildModel: Model<Build>, npointSerive: NpointService);
    OnModuleInit(): Promise<void>;
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

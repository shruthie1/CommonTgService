import { Model } from 'mongoose';
import { Timestamp } from './timestamps.schema';
import { ClientService } from '../clients/client.service';
export declare class TimestampService {
    private timestampModel;
    private clientService;
    constructor(timestampModel: Model<Timestamp>, clientService: ClientService);
    findOne(): Promise<any>;
    getTimeDifferences(threshold?: number): Promise<any>;
    getClientsWithTimeDifference(threshold?: number): Promise<any[]>;
    update(updateTimestampDto: any): Promise<any>;
    clear(): Promise<any>;
}

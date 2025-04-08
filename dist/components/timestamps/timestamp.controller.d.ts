import { TimestampService } from './timestamp.service';
export declare class TimestampController {
    private readonly timestampService;
    constructor(timestampService: TimestampService);
    findOne(): Promise<any>;
    getClientsWithTimeDifference(thresholdMinutes?: number): Promise<any[]>;
    update(updateTimestampDto: any): Promise<any>;
}

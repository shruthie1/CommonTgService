import { PromoteMsgsService } from './promote-msgs.service';
export declare class PromoteMsgsController {
    private readonly promoteMsgsService;
    constructor(promoteMsgsService: PromoteMsgsService);
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

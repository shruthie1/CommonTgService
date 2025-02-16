import { UpiIdService } from './upi-ids.service';
export declare class UpiIdController {
    private readonly UpiIdService;
    constructor(UpiIdService: UpiIdService);
    findOne(): Promise<any>;
    update(updateUpiIdsdto: any): Promise<any>;
}

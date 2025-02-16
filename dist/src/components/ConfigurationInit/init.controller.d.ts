import { ConfigurationService } from './init.service';
export declare class ConfigurationController {
    private readonly configurationService;
    constructor(configurationService: ConfigurationService);
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

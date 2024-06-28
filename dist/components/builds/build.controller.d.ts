import { BuildService } from './build.service';
export declare class BuildController {
    private readonly buildService;
    constructor(buildService: BuildService);
    findOne(): Promise<any>;
    update(updateClientDto: any): Promise<any>;
}

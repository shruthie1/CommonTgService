import { DynamicDataService } from './dynamic-data.service';
import { CreateDynamicDataDto } from './dto/create-dynamic-data.dto';
import { UpdateDynamicDataDto } from './dto/update-dynamic-data.dto';
import { GetDynamicDataDto } from './dto/get-dynamic-data.dto';
export declare class DynamicDataController {
    private readonly dynamicDataService;
    constructor(dynamicDataService: DynamicDataService);
    create(createDynamicDataDto: CreateDynamicDataDto): Promise<import("./dynamic-data.schema").DynamicData>;
    findOne(configKey: string, { path }: GetDynamicDataDto): Promise<any>;
    update(configKey: string, updateDynamicDataDto: UpdateDynamicDataDto): Promise<import("./dynamic-data.schema").DynamicData>;
    remove(configKey: string, { path }: GetDynamicDataDto): Promise<void>;
}

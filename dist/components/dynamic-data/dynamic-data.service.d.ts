import { Model, ClientSession } from 'mongoose';
import { DynamicData, DynamicDataDocument } from './dynamic-data.schema';
import { CreateDynamicDataDto } from './dto/create-dynamic-data.dto';
import { UpdateDynamicDataDto } from './dto/update-dynamic-data.dto';
import * as mongoose from 'mongoose';
export declare class DynamicDataService {
    private dynamicDataModel;
    private readonly connection;
    constructor(dynamicDataModel: Model<DynamicDataDocument>, connection: mongoose.Connection);
    create(createDto: CreateDynamicDataDto): Promise<DynamicData>;
    findOne(configKey: string, path?: string): Promise<any>;
    update(configKey: string, updateDto: UpdateDynamicDataDto, session?: ClientSession): Promise<DynamicData>;
    private handleArrayOperation;
    remove(configKey: string, path?: string): Promise<void>;
}

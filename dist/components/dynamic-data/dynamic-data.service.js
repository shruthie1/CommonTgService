"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DynamicDataService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicDataService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const dynamic_data_schema_1 = require("./dynamic-data.schema");
const update_dynamic_data_dto_1 = require("./dto/update-dynamic-data.dto");
const lodash_1 = require("lodash");
const mongoose_3 = require("@nestjs/mongoose");
const mongoose = __importStar(require("mongoose"));
const utils_1 = require("../../utils");
let DynamicDataService = DynamicDataService_1 = class DynamicDataService {
    constructor(dynamicDataModel, connection) {
        this.dynamicDataModel = dynamicDataModel;
        this.connection = connection;
        this.logger = new common_1.Logger(DynamicDataService_1.name);
    }
    async create(createDto) {
        this.logger.debug(`Creating dynamic data with configKey: ${createDto.configKey}`);
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            this.logger.debug('Started transaction for create operation');
            const exists = await this.dynamicDataModel.findOne({ configKey: createDto.configKey }).session(session);
            if (exists) {
                this.logger.warn(`Attempted to create duplicate configKey: ${createDto.configKey}`);
                throw new common_1.ConflictException(`Document with configKey ${createDto.configKey} already exists`);
            }
            const created = new this.dynamicDataModel(createDto);
            await created.save({ session });
            this.logger.debug(`Successfully created dynamic data for configKey: ${createDto.configKey}`);
            await session.commitTransaction();
            this.logger.debug('Transaction committed successfully');
            return created.toJSON().data;
        }
        catch (error) {
            await session.abortTransaction();
            (0, utils_1.parseError)(error, 'Failed to create dynamic data: ', true);
            this.logger.error(`Failed to create dynamic data: ${error.message}`, error.stack);
            if (error instanceof common_1.ConflictException) {
                throw error;
            }
            throw new common_1.BadRequestException('Failed to create dynamic data');
        }
        finally {
            await session.endSession();
        }
    }
    async findOne(configKey, path) {
        this.logger.debug(`Finding dynamic data with configKey: ${configKey}${path ? `, path: ${path}` : ''}`);
        const doc = await this.dynamicDataModel.findOne({ configKey });
        if (!doc) {
            this.logger.warn(`Document not found with configKey: ${configKey}`);
            throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
        }
        if (path) {
            if (!(0, lodash_1.has)(doc.data, path)) {
                this.logger.warn(`Path ${path} not found in document with configKey: ${configKey}`);
                throw new common_1.NotFoundException(`Path ${path} not found in document`);
            }
            this.logger.debug(`Successfully retrieved data at path: ${path}`);
            return (0, lodash_1.get)(doc.data, path);
        }
        this.logger.debug(`Successfully retrieved full document for configKey: ${configKey}`);
        return doc.toJSON().data;
    }
    async update(configKey, updateDto, session) {
        this.logger.debug(`Updating dynamic data for configKey: ${configKey}`);
        const useSession = session || await this.connection.startSession();
        let shouldEndSession = false;
        try {
            if (!session) {
                shouldEndSession = true;
                await useSession.startTransaction();
                this.logger.debug('Started new transaction for update operation');
            }
            const doc = await this.dynamicDataModel.findOne({ configKey }).session(useSession);
            if (!doc) {
                this.logger.warn(`Document not found with configKey: ${configKey}`);
                throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
            }
            if (updateDto.arrayOperation) {
                if (!updateDto.path) {
                    this.logger.error('Attempted array operation without specifying path');
                    throw new common_1.BadRequestException('Path is required for array operations');
                }
                this.logger.debug(`Performing array operation: ${updateDto.arrayOperation.type} on path: ${updateDto.path}`);
                await this.handleArrayOperation(doc, updateDto, useSession);
            }
            else if (updateDto.path) {
                if (!(0, lodash_1.has)(doc.data, updateDto.path)) {
                    this.logger.warn(`Path ${updateDto.path} not found in document with configKey: ${configKey}`);
                    throw new common_1.NotFoundException(`Path ${updateDto.path} not found in document`);
                }
                this.logger.debug(`Updating value at path: ${updateDto.path}`);
                (0, lodash_1.set)(doc.data, updateDto.path, updateDto.value);
            }
            else {
                this.logger.debug('Performing full data update');
                doc.data = updateDto.value;
            }
            await doc.save({ session: useSession });
            this.logger.debug(`Successfully updated document with configKey: ${configKey}`);
            if (shouldEndSession) {
                await useSession.commitTransaction();
                this.logger.debug('Transaction committed successfully');
            }
            return doc.toJSON();
        }
        catch (error) {
            if (shouldEndSession) {
                await useSession.abortTransaction();
                this.logger.error('Transaction aborted due to error');
            }
            (0, utils_1.parseError)(error, 'Failed to update dynamic data: ', true);
            this.logger.error(`Failed to update dynamic data: ${error.message}`, error.stack);
            throw error;
        }
        finally {
            if (shouldEndSession) {
                await useSession.endSession();
            }
        }
    }
    async handleArrayOperation(doc, updateDto, session) {
        this.logger.debug(`Handling array operation: ${updateDto.arrayOperation.type} at path: ${updateDto.path}`);
        const array = (0, lodash_1.get)(doc.data, updateDto.path);
        if (!Array.isArray(array)) {
            this.logger.error(`Path ${updateDto.path} is not an array`);
            throw new common_1.BadRequestException(`Path ${updateDto.path} is not an array`);
        }
        const { type, index } = updateDto.arrayOperation;
        try {
            switch (type) {
                case update_dynamic_data_dto_1.ArrayOperationType.PUSH:
                    this.logger.debug(`Pushing new value to array at path: ${updateDto.path}`);
                    array.push(updateDto.value);
                    break;
                case update_dynamic_data_dto_1.ArrayOperationType.POP:
                    this.logger.debug(`Popping value from array at path: ${updateDto.path}`);
                    array.pop();
                    break;
                case update_dynamic_data_dto_1.ArrayOperationType.INSERT:
                    if (index === undefined || index < 0 || index > array.length) {
                        this.logger.error(`Invalid index ${index} for INSERT operation`);
                        throw new common_1.BadRequestException('Invalid array index for INSERT operation');
                    }
                    this.logger.debug(`Inserting value at index ${index} in array at path: ${updateDto.path}`);
                    array.splice(index, 0, updateDto.value);
                    break;
                case update_dynamic_data_dto_1.ArrayOperationType.REMOVE:
                    if (index === undefined || index < 0 || index >= array.length) {
                        this.logger.error(`Invalid index ${index} for REMOVE operation`);
                        throw new common_1.BadRequestException('Invalid array index for REMOVE operation');
                    }
                    this.logger.debug(`Removing value at index ${index} from array at path: ${updateDto.path}`);
                    array.splice(index, 1);
                    break;
                case update_dynamic_data_dto_1.ArrayOperationType.UPDATE:
                    if (index === undefined || index < 0 || index >= array.length) {
                        this.logger.error(`Invalid index ${index} for UPDATE operation`);
                        throw new common_1.BadRequestException('Invalid array index for UPDATE operation');
                    }
                    this.logger.debug(`Updating value at index ${index} in array at path: ${updateDto.path}`);
                    array[index] = updateDto.value;
                    break;
                default:
                    this.logger.error(`Invalid array operation type: ${type}`);
                    throw new common_1.BadRequestException('Invalid array operation type');
            }
            (0, lodash_1.set)(doc.data, updateDto.path, array);
            await doc.save({ session });
            this.logger.debug('Array operation completed successfully');
        }
        catch (error) {
            this.logger.error(`Array operation failed: ${error.message}`, error.stack);
            throw error;
        }
    }
    async remove(configKey, path) {
        this.logger.debug(`Removing dynamic data for configKey: ${configKey}${path ? `, path: ${path}` : ''}`);
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            this.logger.debug('Started transaction for remove operation');
            const doc = await this.dynamicDataModel.findOne({ configKey }).session(session);
            if (!doc) {
                this.logger.warn(`Document not found with configKey: ${configKey}`);
                throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
            }
            if (path) {
                if (!(0, lodash_1.has)(doc.data, path)) {
                    this.logger.warn(`Path ${path} not found in document with configKey: ${configKey}`);
                    throw new common_1.NotFoundException(`Path ${path} not found in document`);
                }
                this.logger.debug(`Removing data at path: ${path}`);
                (0, lodash_1.unset)(doc.data, path);
                await doc.save({ session });
            }
            else {
                this.logger.debug(`Deleting entire document with configKey: ${configKey}`);
                await this.dynamicDataModel.deleteOne({ configKey }).session(session);
            }
            await session.commitTransaction();
            this.logger.debug('Transaction committed successfully');
        }
        catch (error) {
            await session.abortTransaction();
            (0, utils_1.parseError)(error, 'Failed to remove dynamic data: ', true);
            this.logger.error(`Failed to remove dynamic data: ${error.message}`, error.stack);
            throw error;
        }
        finally {
            await session.endSession();
        }
    }
};
exports.DynamicDataService = DynamicDataService;
exports.DynamicDataService = DynamicDataService = DynamicDataService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(dynamic_data_schema_1.DynamicData.name)),
    __param(1, (0, mongoose_3.InjectConnection)()),
    __metadata("design:paramtypes", [mongoose_2.Model, mongoose.Connection])
], DynamicDataService);
//# sourceMappingURL=dynamic-data.service.js.map
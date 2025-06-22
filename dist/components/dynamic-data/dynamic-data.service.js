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
let DynamicDataService = class DynamicDataService {
    constructor(dynamicDataModel, connection) {
        this.dynamicDataModel = dynamicDataModel;
        this.connection = connection;
    }
    async create(createDto) {
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            const exists = await this.dynamicDataModel.findOne({ configKey: createDto.configKey }).session(session);
            if (exists) {
                throw new common_1.ConflictException(`Document with configKey ${createDto.configKey} already exists`);
            }
            const created = new this.dynamicDataModel(createDto);
            await created.save({ session });
            await session.commitTransaction();
            return created.toJSON();
        }
        catch (error) {
            await session.abortTransaction();
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
        const doc = await this.dynamicDataModel.findOne({ configKey });
        if (!doc) {
            throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
        }
        if (path) {
            if (!(0, lodash_1.has)(doc.data, path)) {
                throw new common_1.NotFoundException(`Path ${path} not found in document`);
            }
            return (0, lodash_1.get)(doc.data, path);
        }
        return doc.toJSON().data;
    }
    async update(configKey, updateDto, session) {
        const useSession = session || await this.connection.startSession();
        let shouldEndSession = false;
        try {
            if (!session) {
                shouldEndSession = true;
                await useSession.startTransaction();
            }
            const doc = await this.dynamicDataModel.findOne({ configKey }).session(useSession);
            if (!doc) {
                throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
            }
            if (updateDto.arrayOperation) {
                if (!updateDto.path) {
                    throw new common_1.BadRequestException('Path is required for array operations');
                }
                await this.handleArrayOperation(doc, updateDto, useSession);
            }
            else if (updateDto.path) {
                if (!(0, lodash_1.has)(doc.data, updateDto.path)) {
                    throw new common_1.NotFoundException(`Path ${updateDto.path} not found in document`);
                }
                (0, lodash_1.set)(doc.data, updateDto.path, updateDto.value);
            }
            else {
                doc.data = updateDto.value;
            }
            await doc.save({ session: useSession });
            if (shouldEndSession) {
                await useSession.commitTransaction();
            }
            return doc.toJSON();
        }
        catch (error) {
            if (shouldEndSession) {
                await useSession.abortTransaction();
            }
            throw error;
        }
        finally {
            if (shouldEndSession) {
                await useSession.endSession();
            }
        }
    }
    async handleArrayOperation(doc, updateDto, session) {
        const array = (0, lodash_1.get)(doc.data, updateDto.path);
        if (!Array.isArray(array)) {
            throw new common_1.BadRequestException(`Path ${updateDto.path} is not an array`);
        }
        const { type, index } = updateDto.arrayOperation;
        switch (type) {
            case update_dynamic_data_dto_1.ArrayOperationType.PUSH:
                array.push(updateDto.value);
                break;
            case update_dynamic_data_dto_1.ArrayOperationType.POP:
                array.pop();
                break;
            case update_dynamic_data_dto_1.ArrayOperationType.INSERT:
                if (index === undefined || index < 0 || index > array.length) {
                    throw new common_1.BadRequestException('Invalid array index for INSERT operation');
                }
                array.splice(index, 0, updateDto.value);
                break;
            case update_dynamic_data_dto_1.ArrayOperationType.REMOVE:
                if (index === undefined || index < 0 || index >= array.length) {
                    throw new common_1.BadRequestException('Invalid array index for REMOVE operation');
                }
                array.splice(index, 1);
                break;
            case update_dynamic_data_dto_1.ArrayOperationType.UPDATE:
                if (index === undefined || index < 0 || index >= array.length) {
                    throw new common_1.BadRequestException('Invalid array index for UPDATE operation');
                }
                array[index] = updateDto.value;
                break;
            default:
                throw new common_1.BadRequestException('Invalid array operation type');
        }
        (0, lodash_1.set)(doc.data, updateDto.path, array);
        await doc.save({ session });
    }
    async remove(configKey, path) {
        const session = await this.connection.startSession();
        try {
            await session.startTransaction();
            const doc = await this.dynamicDataModel.findOne({ configKey }).session(session);
            if (!doc) {
                throw new common_1.NotFoundException(`Document with configKey ${configKey} not found`);
            }
            if (path) {
                if (!(0, lodash_1.has)(doc.data, path)) {
                    throw new common_1.NotFoundException(`Path ${path} not found in document`);
                }
                (0, lodash_1.unset)(doc.data, path);
                await doc.save({ session });
            }
            else {
                await this.dynamicDataModel.deleteOne({ configKey }).session(session);
            }
            await session.commitTransaction();
        }
        catch (error) {
            await session.abortTransaction();
            throw error;
        }
        finally {
            await session.endSession();
        }
    }
};
exports.DynamicDataService = DynamicDataService;
exports.DynamicDataService = DynamicDataService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(dynamic_data_schema_1.DynamicData.name)),
    __param(1, (0, mongoose_3.InjectConnection)()),
    __metadata("design:paramtypes", [mongoose_2.Model, mongoose.Connection])
], DynamicDataService);
//# sourceMappingURL=dynamic-data.service.js.map
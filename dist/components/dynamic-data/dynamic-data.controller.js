"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicDataController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const dynamic_data_service_1 = require("./dynamic-data.service");
const create_dynamic_data_dto_1 = require("./dto/create-dynamic-data.dto");
const update_dynamic_data_dto_1 = require("./dto/update-dynamic-data.dto");
const get_dynamic_data_dto_1 = require("./dto/get-dynamic-data.dto");
let DynamicDataController = class DynamicDataController {
    constructor(dynamicDataService) {
        this.dynamicDataService = dynamicDataService;
    }
    async create(createDynamicDataDto) {
        return this.dynamicDataService.create(createDynamicDataDto);
    }
    async findAll() {
        return this.dynamicDataService.findAll();
    }
    async checkNpoint() {
        await this.dynamicDataService.checkNpoint();
        return { message: 'Npoint check completed' };
    }
    async findOne(configKey, { path }) {
        return this.dynamicDataService.findOne(configKey, path);
    }
    async update(configKey, updateDynamicDataDto) {
        return this.dynamicDataService.update(configKey, updateDynamicDataDto);
    }
    async remove(configKey, { path }) {
        await this.dynamicDataService.remove(configKey, path);
    }
};
exports.DynamicDataController = DynamicDataController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new dynamic data document' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'The dynamic data document has been successfully created.',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Conflict - Document already exists' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_dynamic_data_dto_1.CreateDynamicDataDto]),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all dynamic data documents' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Returns all dynamic data documents as a key-value object',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('check-npoint'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Check and update npoint data if needed' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Npoint data check completed successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "checkNpoint", null);
__decorate([
    (0, common_1.Get)(':configKey'),
    (0, swagger_1.ApiOperation)({ summary: 'Get dynamic data by configKey' }),
    (0, swagger_1.ApiParam)({ name: 'configKey', description: 'Unique identifier for the document' }),
    (0, swagger_1.ApiQuery)({
        name: 'path',
        required: false,
        description: 'Optional path to retrieve specific nested data',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Returns the requested dynamic data' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Document or path not found' }),
    __param(0, (0, common_1.Param)('configKey')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, get_dynamic_data_dto_1.GetDynamicDataDto]),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':configKey'),
    (0, swagger_1.ApiOperation)({ summary: 'Update dynamic data by configKey' }),
    (0, swagger_1.ApiParam)({ name: 'configKey', description: 'Unique identifier for the document' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'The dynamic data has been successfully updated' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Document not found' }),
    __param(0, (0, common_1.Param)('configKey')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_dynamic_data_dto_1.UpdateDynamicDataDto]),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':configKey'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete dynamic data by configKey' }),
    (0, swagger_1.ApiParam)({ name: 'configKey', description: 'Unique identifier for the document' }),
    (0, swagger_1.ApiQuery)({
        name: 'path',
        required: false,
        description: 'Optional path to delete specific nested data',
    }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'The dynamic data has been successfully deleted' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Document or path not found' }),
    __param(0, (0, common_1.Param)('configKey')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, get_dynamic_data_dto_1.GetDynamicDataDto]),
    __metadata("design:returntype", Promise)
], DynamicDataController.prototype, "remove", null);
exports.DynamicDataController = DynamicDataController = __decorate([
    (0, swagger_1.ApiTags)('dynamic-data'),
    (0, common_1.Controller)('dynamic-data'),
    __metadata("design:paramtypes", [dynamic_data_service_1.DynamicDataService])
], DynamicDataController);
//# sourceMappingURL=dynamic-data.controller.js.map
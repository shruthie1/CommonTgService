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
exports.NpointController = void 0;
const common_1 = require("@nestjs/common");
const npoint_service_1 = require("./npoint.service");
const swagger_1 = require("@nestjs/swagger");
let NpointController = class NpointController {
    constructor(npointService) {
        this.npointService = npointService;
    }
    async fetchDocument(id) {
        try {
            return await this.npointService.fetchDocument(id);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async postDocument(document) {
        try {
            return await this.npointService.postDocument(document);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async fetchAllDocuments() {
        try {
            return await this.npointService.fetchAllDocuments();
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateDocument(id, updatedDocument) {
        try {
            return await this.npointService.updateDocument(id, updatedDocument);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
};
exports.NpointController = NpointController;
__decorate([
    (0, common_1.Get)('documents/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Fetch a document by ID' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'The ID of the document to fetch' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Document fetched successfully',
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Document not found' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NpointController.prototype, "fetchDocument", null);
__decorate([
    (0, common_1.Post)('documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Post a new document' }),
    (0, swagger_1.ApiBody)({
        description: 'The document to post',
        schema: {
            example: {
                title: 'My Document',
                content: 'This is the content of the document.',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Document posted successfully',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NpointController.prototype, "postDocument", null);
__decorate([
    (0, common_1.Get)('documents'),
    (0, swagger_1.ApiOperation)({ summary: 'Fetch all documents' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'List of all documents fetched successfully',
    }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal server error' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NpointController.prototype, "fetchAllDocuments", null);
__decorate([
    (0, common_1.Put)('documents/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a document by ID' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'The ID of the document to update' }),
    (0, swagger_1.ApiBody)({
        description: 'The updated document',
        schema: {
            example: {
                title: 'Updated Document',
                content: 'This is the updated content of the document.',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Document updated successfully',
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Document not found' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NpointController.prototype, "updateDocument", null);
exports.NpointController = NpointController = __decorate([
    (0, swagger_1.ApiTags)('NPoint API'),
    (0, common_1.Controller)('npoint'),
    __metadata("design:paramtypes", [npoint_service_1.NpointService])
], NpointController);
//# sourceMappingURL=npoint.controller.js.map
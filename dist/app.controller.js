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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const fs_1 = require("fs");
const multer_1 = require("multer");
const path_1 = require("path");
const axios_1 = __importDefault(require("axios"));
const execute_request_dto_1 = require("./components/shared/dto/execute-request.dto");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    getHello() {
        return this.appService.getHello();
    }
    async uploadFileAndUpdate(file) {
        try {
            const targetDir = (0, path_1.join)(__dirname, '..', 'node_modules', 'commonService', 'dist');
            const filePath = (0, path_1.join)(targetDir, 'index.js');
            if (!(0, fs_1.existsSync)(targetDir)) {
                (0, fs_1.mkdirSync)(targetDir, { recursive: true });
            }
            const fileBuffer = await fs_1.promises.readFile(file.path);
            await fs_1.promises.writeFile(filePath, fileBuffer);
            console.log('commonService/index.js updated successfully.');
            return { message: 'commonService/index.js updated successfully' };
        }
        catch (error) {
            console.error('Failed to update commonService/index.js:', error);
            throw error;
        }
    }
    async executeRequest(requestDetails) {
        try {
            const { url, method = 'GET', headers = {}, data, params } = requestDetails;
            const response = await (0, axios_1.default)({
                url,
                method,
                headers,
                data,
                params,
                validateStatus: () => true
            });
            return response.data;
        }
        catch (error) {
            throw new common_1.HttpException({
                message: 'Failed to execute request',
                error: error.message
            }, 500);
        }
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Post)('updateCommonService'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                try {
                    const folderPath = (0, path_1.join)(__dirname, '..', 'uploads');
                    if (!(0, fs_1.existsSync)(folderPath)) {
                        (0, fs_1.mkdirSync)(folderPath, { recursive: true });
                    }
                    cb(null, folderPath);
                }
                catch (error) {
                    cb(error, null);
                }
            },
            filename: (req, file, cb) => {
                cb(null, 'index.js');
            },
        }),
    })),
    (0, swagger_1.ApiOperation)({ summary: 'Upload a file to update commonService index.js' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
        },
    }),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof multer_1.File !== "undefined" && multer_1.File) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadFileAndUpdate", null);
__decorate([
    (0, common_1.Post)('execute-request'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute an HTTP request with given details' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['url'],
            properties: {
                url: { type: 'string', description: 'The URL to send the request to' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
                headers: { type: 'object', additionalProperties: { type: 'string' } },
                data: { type: 'object', description: 'Request body data' },
                params: { type: 'object', additionalProperties: { type: 'string' } }
            }
        }
    }),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [execute_request_dto_1.ExecuteRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "executeRequest", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map
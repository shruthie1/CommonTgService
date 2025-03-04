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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const swagger_1 = require("@nestjs/swagger");
const axios_1 = __importDefault(require("axios"));
const execute_request_dto_1 = require("./components/shared/dto/execute-request.dto");
const crypto_1 = require("crypto");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
        this.logger = new common_1.Logger('AppController');
    }
    getHello() {
        return this.appService.getHello();
    }
    async executeRequest(requestDetails, res) {
        const requestId = (0, crypto_1.randomUUID)();
        const startTime = Date.now();
        try {
            const { url, method = 'GET', headers = {}, data, params, responseType = 'json', timeout = 30000, followRedirects = true, maxRedirects = 5 } = requestDetails;
            this.logger.log({
                message: 'Executing HTTP request',
                requestId,
                details: {
                    url,
                    method,
                    headers: this.sanitizeHeaders(headers),
                    params,
                    responseType,
                    timeout,
                    dataSize: data ? JSON.stringify(data).length : 0
                }
            });
            const response = await (0, axios_1.default)({
                url,
                method,
                headers,
                data,
                params,
                responseType,
                timeout,
                maxRedirects: followRedirects ? maxRedirects : 0,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: () => true,
                decompress: true,
            });
            res.status(response.status);
            Object.entries(response.headers).forEach(([key, value]) => {
                if (key.toLowerCase() === 'transfer-encoding')
                    return;
                if (Array.isArray(value)) {
                    res.setHeader(key, value);
                }
                else {
                    res.setHeader(key, value);
                }
            });
            this.logger.log({
                message: 'Request completed',
                requestId,
                metrics: {
                    executionTime: Date.now() - startTime,
                    status: response.status,
                    contentType: response.headers['content-type']
                }
            });
            if (responseType === 'arraybuffer' ||
                response.headers['content-type']?.includes('application/octet-stream') ||
                response.headers['content-type']?.includes('image/') ||
                response.headers['content-type']?.includes('audio/') ||
                response.headers['content-type']?.includes('video/') ||
                response.headers['content-type']?.includes('application/pdf')) {
                if (!res.getHeader('content-type') && response.headers['content-type']) {
                    res.setHeader('content-type', response.headers['content-type']);
                }
                return res.send(Buffer.from(response.data));
            }
            return res.send(response.data);
        }
        catch (error) {
            this.logger.error({
                message: 'Request failed',
                requestId,
                error: {
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                }
            });
            if (error.response) {
                Object.entries(error.response.headers).forEach(([key, value]) => {
                    if (key.toLowerCase() === 'transfer-encoding')
                        return;
                    if (Array.isArray(value)) {
                        res.setHeader(key, value);
                    }
                    else {
                        res.setHeader(key, value);
                    }
                });
                return res.status(error.response.status).send(error.response.data);
            }
            return res.status(500).json({
                message: error.message,
                code: error.code
            });
        }
    }
    sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];
        return Object.entries(headers).reduce((acc, [key, value]) => {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
                acc[key] = '[REDACTED]';
            }
            else {
                acc[key] = value;
            }
            return acc;
        }, {});
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
    (0, common_1.Post)('execute-request'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute an HTTP request with given details' }),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({ transform: true }))),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [execute_request_dto_1.ExecuteRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "executeRequest", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AppController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const axios_1 = __importDefault(require("axios"));
const execute_request_dto_1 = require("./components/shared/dto/execute-request.dto");
const crypto_1 = require("crypto");
const https = __importStar(require("https"));
const url_1 = require("url");
const utils_1 = require("./utils");
let AppController = AppController_1 = class AppController {
    constructor() {
        this.logger = new utils_1.Logger(AppController_1.name);
        this.DEFAULT_TIMEOUT = 30000;
        this.MAX_CONTENT_SIZE = 50 * 1024 * 1024;
    }
    getHello() {
        return 'Hello World!';
    }
    async executeRequest(req, res) {
        const requestId = (0, crypto_1.randomUUID)();
        const startTime = Date.now();
        try {
            const { url, method = 'GET', headers = {}, data, params, responseType = 'json', timeout = this.DEFAULT_TIMEOUT, followRedirects = true, maxRedirects = 5 } = req;
            if (!url) {
                throw new common_1.HttpException('URL is required', common_1.HttpStatus.BAD_REQUEST);
            }
            try {
                const parsedUrl = new url_1.URL(url);
                if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                    throw new common_1.HttpException('Invalid URL protocol. Only HTTP and HTTPS are supported.', common_1.HttpStatus.BAD_REQUEST);
                }
            }
            catch (error) {
                throw new common_1.HttpException('Invalid URL format', common_1.HttpStatus.BAD_REQUEST);
            }
            this.logger.log(`[${requestId}] Starting HTTP ${method} request to ${url}`);
            const httpsAgent = new https.Agent({
                rejectUnauthorized: true
            });
            const response = await (0, axios_1.default)({
                url,
                method,
                headers: {
                    ...headers,
                    'x-api-key': process.env.X_API_KEY || 'santoor',
                },
                data,
                params,
                responseType,
                timeout,
                maxRedirects: followRedirects ? maxRedirects : 0,
                maxContentLength: this.MAX_CONTENT_SIZE,
                maxBodyLength: this.MAX_CONTENT_SIZE,
                validateStatus: null,
                decompress: true,
                httpsAgent,
                transitional: {
                    clarifyTimeoutError: true
                }
            });
            const executionTime = Date.now() - startTime;
            this.logger.log(`[${requestId}] Completed in ${executionTime}ms with status ${response.status}`);
            Object.entries(response.headers).forEach(([key, value]) => {
                if (key.toLowerCase() === 'transfer-encoding')
                    return;
                if (Array.isArray(value)) {
                    res.setHeader(key, value);
                }
                else if (value) {
                    res.setHeader(key, value.toString());
                }
            });
            res.status(response.status);
            if (this.isBinaryResponse(responseType, response.headers['content-type'])) {
                if (!res.getHeader('content-type') && response.headers['content-type']) {
                    res.setHeader('content-type', response.headers['content-type']);
                }
                res.send(Buffer.from(response.data));
            }
            else {
                res.send(response.data);
            }
            return;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            (0, utils_1.parseError)(error, `Failed to Execute Request: ${req.url} | Method: ${req.method?.toUpperCase()}`);
            this.logger.error({
                message: `[${requestId}] Request failed after ${executionTime}ms`,
                requestId,
                request: {
                    url: req.url,
                    method: req.method || 'GET',
                    params: req.params,
                    headers: this.sanitizeHeaders(req.headers || {}),
                    timeout: req.timeout || this.DEFAULT_TIMEOUT,
                    responseType: req.responseType || 'json'
                },
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    code: error.code,
                    status: error.response?.status,
                    responseData: error.response?.data
                }
            });
            const errorDetails = this.handleRequestError(error, requestId);
            res.status(errorDetails.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            res.send(errorDetails);
            return;
        }
    }
    sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'proxy-authorization'];
        const sanitized = { ...headers };
        sensitiveHeaders.forEach(header => {
            Object.keys(sanitized).forEach(key => {
                if (key.toLowerCase() === header.toLowerCase()) {
                    sanitized[key] = '[REDACTED]';
                }
            });
        });
        return sanitized;
    }
    isBinaryResponse(responseType, contentType) {
        if (responseType === 'arraybuffer')
            return true;
        if (contentType) {
            const binaryTypes = [
                'application/octet-stream',
                'image/',
                'audio/',
                'video/',
                'application/pdf',
                'application/zip',
                'application/x-zip-compressed',
                'application/binary'
            ];
            return binaryTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
        }
        return false;
    }
    handleRequestError(error, requestId) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            if (axiosError.code === 'ECONNABORTED') {
                return {
                    status: common_1.HttpStatus.GATEWAY_TIMEOUT,
                    error: 'Request timeout',
                    message: 'The request took too long to complete',
                    requestId
                };
            }
            if (axiosError.code === 'ECONNREFUSED') {
                return {
                    status: common_1.HttpStatus.BAD_GATEWAY,
                    error: 'Connection refused',
                    message: 'Could not connect to the target server',
                    requestId
                };
            }
            if (axiosError.response) {
                return {
                    status: axiosError.response.status,
                    headers: this.sanitizeHeaders(axiosError.response.headers),
                    data: axiosError.response.data,
                    requestId
                };
            }
            if (axiosError.request) {
                return {
                    status: common_1.HttpStatus.BAD_GATEWAY,
                    error: 'No response',
                    message: 'The request was made but no response was received',
                    code: axiosError.code,
                    requestId
                };
            }
            return {
                status: common_1.HttpStatus.BAD_GATEWAY,
                error: axiosError.code || 'Request failed',
                message: axiosError.message,
                requestId
            };
        }
        return {
            status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'Internal server error',
            message: error.message || 'An unexpected error occurred',
            requestId
        };
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
    (0, swagger_1.ApiOperation)({
        summary: 'Execute an HTTP request with given details',
        description: 'Makes an HTTP request to the specified URL with provided configuration and returns the response'
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Request executed successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid request parameters' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Too many requests' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal server error or request execution failed' }),
    __param(0, (0, common_1.Body)(new common_1.ValidationPipe({
        transform: true,
        forbidNonWhitelisted: true,
        whitelist: true
    }))),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [execute_request_dto_1.ExecuteRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "executeRequest", null);
exports.AppController = AppController = AppController_1 = __decorate([
    (0, swagger_1.ApiTags)('App'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [])
], AppController);
//# sourceMappingURL=app.controller.js.map
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
const client_service_1 = require("./components/clients/client.service");
const app_service_1 = require("./app.service");
const cloudflare_cache_interceptor_1 = require("./interceptors/cloudflare-cache.interceptor");
const no_cache_decorator_1 = require("./decorators/no-cache.decorator");
let AppController = AppController_1 = class AppController {
    constructor(clientService, appService) {
        this.clientService = clientService;
        this.appService = appService;
        this.logger = new utils_1.Logger(AppController_1.name);
        this.DEFAULT_TIMEOUT = 30000;
        this.MAX_CONTENT_SIZE = 50 * 1024 * 1024;
    }
    getHello() {
        return 'Hello World!';
    }
    health() {
        return this.getHello();
    }
    async refreshMap() {
        await this.clientService.refreshMap();
    }
    async setupClient(clientId, query) {
        return this.appService.setupClient(clientId, query);
    }
    async forward(url, query) {
        if (!url)
            throw new common_1.BadRequestException('url query parameter is required');
        try {
            new url_1.URL(url);
        }
        catch {
            throw new common_1.BadRequestException('url query parameter must be a valid URL');
        }
        const { url: _url, ...params } = query;
        return this.appService.forwardGetRequest(url, params);
    }
    async processUsers(limit, skip) {
        return this.appService.processEligibleUsers(limit, skip);
    }
    exit() {
        setTimeout(() => process.exit(0), 2_000);
        return 'Exiting application... in 2 seconds';
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
            this.logger.log(`[${requestId}] Starting HTTP ${method} request to ${this.sanitizeUrl(url)}`);
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
            const contentType = response.headers['content-type'] != null
                ? String(response.headers['content-type'])
                : undefined;
            if (this.isBinaryResponse(responseType, contentType)) {
                if (!res.getHeader('content-type') && contentType) {
                    res.setHeader('content-type', contentType);
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
            (0, utils_1.parseError)(error, `Failed to Execute Request: ${this.sanitizeUrl(req.url)} | Method: ${req.method?.toUpperCase()}`);
            this.logger.error({
                message: `[${requestId}] Request failed after ${executionTime}ms`,
                requestId,
                request: {
                    url: this.sanitizeUrl(req.url),
                    method: req.method || 'GET',
                    params: this.sanitizeParams(req.params),
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
        const sensitiveHeaders = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'api-key', 'apikey', 'api_key', 'x-auth-token', 'access-token', 'refresh-token'];
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
    sanitizeUrl(url) {
        return (url || '').replace(/([?&](?:apiKey|apikey|api_key|x-api-key|token|access_token|refresh_token|authorization|auth|key|secret|password)=)[^&]*/gi, '$1[REDACTED]');
    }
    sanitizeParams(params) {
        if (!params)
            return params;
        const sanitized = {};
        for (const [key, value] of Object.entries(params)) {
            sanitized[key] = this.isSensitiveField(key) ? '[REDACTED]' : value;
        }
        return sanitized;
    }
    isSensitiveField(key) {
        return /^(apiKey|apikey|api_key|x-api-key|token|access_token|refresh_token|authorization|auth|key|secret|password)$/i.test(key);
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
    async blockUserAll(tgId) {
        return await this.appService.blockUserAll(tgId);
    }
    async unblockUserAll(tgId) {
        return await this.appService.unblockUserAll(tgId);
    }
    async isRecentUser(chatId) {
        return this.appService.isRecentUser(chatId);
    }
    async updateRecentUser(chatId, videoDetails) {
        return await this.appService.updateRecentUser(chatId, videoDetails);
    }
    async resetRecentUser(chatId) {
        return this.appService.resetRecentUser(chatId);
    }
    async getPaymentStats(chatId, profile) {
        return this.appService.getPaymentStats(chatId, profile);
    }
    async sendToChannel(message, chatId, token) {
        try {
            if (message.length < 1500) {
                return await this.appService.sendToChannel(chatId, token, message);
            }
            else {
                console.log('Skipped Message:', decodeURIComponent(message));
                return 'sent';
            }
        }
        catch (e) {
            (0, utils_1.parseError)(e);
        }
    }
    async sendToAll(query) {
        try {
            const decodedEndpoint = decodeURIComponent(query);
            this.appService.sendToAll(decodedEndpoint);
            return `Send ${query}`;
        }
        catch (e) {
            (0, utils_1.parseError)(e);
            throw e;
        }
    }
    async joinChannelsforBufferClients() {
        return this.appService.joinchannelForClients();
    }
    async maskedCls(query) {
        return await this.appService.findAllMasked(query);
    }
    async portalData(query) {
        return await this.appService.portalData(query);
    }
    async requestCall(username, chatId, type) {
        return await this.appService.getRequestCall(username, chatId, type);
    }
    async refreshPrimary() {
        this.appService.refreshPrimary();
        return '1';
    }
    async refreshSecondary() {
        this.appService.refreshSecondary();
        return '2';
    }
    async exitPrimary() {
        this.appService.exitPrimary();
        return '1';
    }
    async exitSecondary() {
        this.appService.exitSecondary();
        return '2';
    }
    async getVidData(profile, clientId, chatId) {
        return await this.appService.getUserData(profile, clientId, chatId);
    }
    async updateVidData(profile, clientId, body) {
        return await this.appService.updateUserData(profile, clientId, body);
    }
    async updtaeUserConfig(filter, data) {
        throw new Error('Method not implemented');
    }
    async getUserConfig(filter) {
        return this.appService.getUserConfig(filter);
    }
    async getallupiIds() {
        return await this.appService.getallupiIds();
    }
    async updateUserConfig(chatId, profile, data) {
        return await this.appService.updateUserConfig(chatId, profile, data);
    }
    async getUserInfo(filter) {
        return await this.appService.getUserInfo(filter);
    }
    async getData(res) {
        this.appService.checkAndRefresh();
        const data = await this.appService.getData();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!doctype html>
      <html>
        <head><title>UMS dashboard</title></head>
        <body>
          ${data}
          <script>
            setInterval(() => window.location.reload(), 20000);
          </script>
        </body>
      </html>`);
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
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('refreshmap'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "refreshMap", null);
__decorate([
    (0, common_1.Get)('setupClient/:clientId'),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "setupClient", null);
__decorate([
    (0, common_1.Get)('forward'),
    __param(0, (0, common_1.Query)('url')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "forward", null);
__decorate([
    (0, common_1.Get)('processUsers/:limit/:skip'),
    __param(0, (0, common_1.Param)('limit', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('skip', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "processUsers", null);
__decorate([
    (0, common_1.Get)('exit'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "exit", null);
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
__decorate([
    (0, common_1.Get)('blockUserAll/:tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Block user across all services' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'Telegram ID of the user', type: String }),
    (0, swagger_1.ApiResponse)({ description: 'Returns result of blocking user' }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "blockUserAll", null);
__decorate([
    (0, common_1.Get)('unblockUserAll/:tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Unblock user across all services' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'Telegram ID of the user', type: String }),
    (0, swagger_1.ApiResponse)({ description: 'Returns result of unblocking user' }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "unblockUserAll", null);
__decorate([
    (0, common_1.Get)('isRecentUser'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Check if user is recent and return access data' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true }),
    (0, swagger_1.ApiResponse)({ description: 'Returns count of recent accesses and video details' }),
    __param(0, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "isRecentUser", null);
__decorate([
    (0, common_1.Post)('isRecentUser'),
    (0, swagger_1.ApiOperation)({ summary: 'Update recent user data' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true }),
    (0, swagger_1.ApiBody)({ description: 'Video details to update', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'Successfully updated recent user data' }),
    __param(0, (0, common_1.Query)('chatId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updateRecentUser", null);
__decorate([
    (0, common_1.Get)('resetRecentUser'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Reset recent user data' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID of the user', type: String, required: true }),
    (0, swagger_1.ApiResponse)({ description: 'Returns count of recent accesses after reset' }),
    __param(0, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "resetRecentUser", null);
__decorate([
    (0, common_1.Get)('paymentStats'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get payment statistics' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID of the user', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'profile', description: 'Profile identifier', type: String }),
    (0, swagger_1.ApiResponse)({ description: 'Returns payment statistics' }),
    __param(0, (0, common_1.Query)('chatId')),
    __param(1, (0, common_1.Query)('profile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getPaymentStats", null);
__decorate([
    (0, common_1.Get)('sendToChannel'),
    (0, swagger_1.ApiOperation)({ summary: 'Send message to channel' }),
    (0, swagger_1.ApiQuery)({ name: 'msg', description: 'Message to send', type: String, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID of the channel', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'token', description: 'Token for authentication', type: String, required: false }),
    (0, swagger_1.ApiResponse)({ description: 'Returns result of sending message to channel' }),
    __param(0, (0, common_1.Query)('msg')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "sendToChannel", null);
__decorate([
    (0, common_1.Get)('sendToAll'),
    (0, swagger_1.ApiOperation)({ summary: 'Send endpoint to all clients' }),
    (0, swagger_1.ApiQuery)({ name: 'query', description: 'Endpoint to send', type: String, required: true }),
    (0, swagger_1.ApiResponse)({ description: 'Returns confirmation of endpoint sent' }),
    __param(0, (0, common_1.Query)('query')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "sendToAll", null);
__decorate([
    (0, common_1.Get)('joinChannelsForClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Join channels for clients' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns result of joining channels for clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "joinChannelsforBufferClients", null);
__decorate([
    (0, common_1.Get)('maskedCls'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Retrieve masked CLS data' }),
    (0, swagger_1.ApiQuery)({ name: 'query', description: 'Query parameters', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'Returns masked CLS data' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "maskedCls", null);
__decorate([
    (0, common_1.Get)('portalData'),
    (0, swagger_1.ApiOperation)({ summary: 'Retrieve portal data' }),
    (0, swagger_1.ApiQuery)({ name: 'query', description: 'Query parameters', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'Returns portal data including client and UPIs' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "portalData", null);
__decorate([
    (0, common_1.Get)('/requestcall'),
    (0, swagger_1.ApiOperation)({ summary: 'Request a call' }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'Username', type: String, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', type: String, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'type', description: 'Ladder type', type: String, required: false }),
    (0, swagger_1.ApiResponse)({ description: 'Call request processed successfully' }),
    __param(0, (0, common_1.Query)('username')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "requestCall", null);
__decorate([
    (0, common_1.Get)('refreshPrimary'),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh primary clients' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns confirmation of primary clients refresh' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "refreshPrimary", null);
__decorate([
    (0, common_1.Get)('refreshSecondary'),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh secondary clients' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns confirmation of secondary clients refresh' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "refreshSecondary", null);
__decorate([
    (0, common_1.Get)('exitPrimary'),
    (0, swagger_1.ApiOperation)({ summary: 'Exit primary clients' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns confirmation of exiting primary clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "exitPrimary", null);
__decorate([
    (0, common_1.Get)('exitSecondary'),
    (0, swagger_1.ApiOperation)({ summary: 'Exit secondary clients' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns confirmation of exiting secondary clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "exitSecondary", null);
__decorate([
    (0, common_1.Get)('/getviddata'),
    (0, swagger_1.ApiOperation)({ summary: 'Get video data' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', description: 'Profile', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', description: 'Client ID', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', type: String, required: true }),
    (0, swagger_1.ApiResponse)({ description: 'Video data retrieved successfully' }),
    __param(0, (0, common_1.Query)('profile')),
    __param(1, (0, common_1.Query)('clientId')),
    __param(2, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getVidData", null);
__decorate([
    (0, common_1.Post)('/getviddata'),
    (0, swagger_1.ApiOperation)({ summary: 'Update video data' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', description: 'Profile', type: String, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', description: 'Client ID', type: String, required: false }),
    (0, swagger_1.ApiBody)({ description: 'Body data', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'Video data updated successfully' }),
    __param(0, (0, common_1.Query)('profile')),
    __param(1, (0, common_1.Query)('clientId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updateVidData", null);
__decorate([
    (0, common_1.Post)('/getUserConfig'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user configuration' }),
    (0, swagger_1.ApiQuery)({ name: 'filter', description: 'Filter parameters', type: Object }),
    (0, swagger_1.ApiBody)({ description: 'Configuration data', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'User configuration updated successfully' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updtaeUserConfig", null);
__decorate([
    (0, common_1.Get)('/getUserConfig'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user configuration' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getUserConfig", null);
__decorate([
    (0, common_1.Get)('/getallupiIds'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all UPI IDs' }),
    (0, swagger_1.ApiResponse)({ description: 'All UPI IDs retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getallupiIds", null);
__decorate([
    (0, common_1.Post)('/updateUserData/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user configuration' }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'Chat ID', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'profile', description: 'Profile', type: String, required: false }),
    (0, swagger_1.ApiBody)({ description: 'User data', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'User configuration updated successfully' }),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Query)('profile')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updateUserConfig", null);
__decorate([
    (0, common_1.Get)('/getUserInfo'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get user information' }),
    (0, swagger_1.ApiQuery)({ name: 'filter', description: 'Filter parameters', type: Object }),
    (0, swagger_1.ApiResponse)({ description: 'User information retrieved successfully' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getUserInfo", null);
__decorate([
    (0, common_1.Get)('getdata'),
    (0, common_1.UseInterceptors)(cloudflare_cache_interceptor_1.CloudflareCacheInterceptor),
    (0, no_cache_decorator_1.NoCache)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get data and refresh periodically' }),
    (0, swagger_1.ApiResponse)({ description: 'Returns HTML data with periodic refresh' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getData", null);
exports.AppController = AppController = AppController_1 = __decorate([
    (0, swagger_1.ApiTags)('App'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [client_service_1.ClientService,
        app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map
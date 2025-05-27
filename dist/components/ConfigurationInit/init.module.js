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
var initModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.initModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const init_service_1 = require("./init.service");
const configuration_schema_1 = require("./configuration.schema");
const init_controller_1 = require("./init.controller");
const mongoose_2 = require("mongoose");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
let initModule = initModule_1 = class initModule {
    constructor(connection) {
        this.connection = connection;
    }
    static forRoot() {
        const mongooseModules = [
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => {
                    const uri = process.env.mongouri || configService.get('mongouri');
                    if (!uri) {
                        throw new Error('MongoDB URI is not configured');
                    }
                    return {
                        uri,
                        useNewUrlParser: true,
                        useUnifiedTopology: true,
                        maxPoolSize: 10,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 45000,
                    };
                },
                inject: [config_1.ConfigService],
            }),
            mongoose_1.MongooseModule.forFeature([{
                    name: 'configurationModule',
                    collection: 'configuration',
                    schema: configuration_schema_1.ConfigurationSchema
                }])
        ];
        return {
            module: initModule_1,
            imports: [
                config_1.ConfigModule.forRoot({
                    isGlobal: true,
                    cache: true,
                    expandVariables: true,
                    envFilePath: '.env',
                }),
                ...mongooseModules
            ],
            exports: [config_1.ConfigModule, ...mongooseModules],
            providers: [init_service_1.ConfigurationService],
            controllers: [init_controller_1.ConfigurationController],
            global: true,
        };
    }
    async onModuleInit() {
        console.log(`Initializing configuration module...`);
        try {
            await this.connection.asPromise();
            console.log(`MongoDB connection established`);
            console.log(`Started :: ${process.env.clientId}`);
        }
        catch (error) {
            console.error('Failed to initialize MongoDB connection:', error);
            throw error;
        }
    }
    async onModuleDestroy() {
        console.log("Init Module Destroying");
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`closed :: ${process.env.clientId}`)}`);
            await this.closeConnection();
        }
        catch (error) {
            console.error('Error during module cleanup:', error);
        }
    }
    async closeConnection() {
        console.log("Closing mongoose connection");
        try {
            await this.connection.close(true);
            console.log("MongoDB connection closed successfully");
        }
        catch (error) {
            console.error('Error closing MongoDB connection:', error);
            throw error;
        }
    }
};
exports.initModule = initModule;
exports.initModule = initModule = initModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [init_service_1.ConfigurationService],
        controllers: [init_controller_1.ConfigurationController],
    }),
    __param(0, (0, common_1.Inject)((0, mongoose_1.getConnectionToken)())),
    __metadata("design:paramtypes", [mongoose_2.Connection])
], initModule);
//# sourceMappingURL=init.module.js.map
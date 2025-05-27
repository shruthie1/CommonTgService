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
var ConfigurationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const TelegramBots_config_1 = require("../../utils/TelegramBots.config");
const config_1 = require("@nestjs/config");
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
        if (!process.env.mongouri) {
            await this.setEnv();
        }
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
//# sourceMappingURL=init.service.js.map
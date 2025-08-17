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
var UpiIdService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpiIdService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const npoint_service_1 = require("../n-point/npoint.service");
let UpiIdService = UpiIdService_1 = class UpiIdService {
    constructor(upiIdModel, npointService) {
        this.upiIdModel = upiIdModel;
        this.npointService = npointService;
        this.logger = new common_1.Logger(UpiIdService_1.name);
        this.checkInterval = null;
        this.upiIds = null;
        this.isInitialized = false;
        this.REFRESH_INTERVAL = 5 * 60 * 1000;
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 1000;
    }
    async onModuleInit() {
        this.logger.log('UPI ID Service initializing...');
        try {
            await this.initializeService();
            this.logger.log('UPI ID Service initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize UPI ID Service', error.stack);
            throw error;
        }
    }
    onModuleDestroy() {
        this.logger.log('UPI ID Service shutting down...');
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.logger.log('UPI ID Service shutdown complete');
    }
    async initializeService() {
        try {
            await this.refreshUPIs();
            this.startPeriodicCheck();
            this.isInitialized = true;
        }
        catch (error) {
            this.logger.error('Service initialization failed', error.stack);
            throw new Error('UPI ID Service initialization failed');
        }
    }
    startPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.checkInterval = setInterval(async () => {
            try {
                await Promise.all([
                    this.refreshUPIs(),
                    this.checkNpoint()
                ]);
            }
            catch (error) {
                this.logger.error('Error during periodic check', error.stack);
            }
        }, this.REFRESH_INTERVAL);
    }
    async refreshUPIs() {
        try {
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });
            if (result) {
                this.upiIds = { ...result };
            }
            else {
                this.logger.warn('No UPI data found in database');
            }
        }
        catch (error) {
            this.logger.error('Failed to refresh UPIs', error.stack);
            throw error;
        }
    }
    async checkNpoint() {
        try {
        }
        catch (error) {
            this.logger.error('Error checking npoint', error.stack);
        }
    }
    async findOne() {
        if (!this.isInitialized) {
            throw new Error('Service not initialized. Please wait for initialization to complete.');
        }
        try {
            if (this.upiIds && Object.keys(this.upiIds).length > 0) {
                return { ...this.upiIds };
            }
            this.logger.debug('Cache miss, fetching from database...');
            const result = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOne({}).lean().exec();
            });
            if (!result) {
                this.logger.warn('No UPI data found');
                return null;
            }
            this.upiIds = { ...result };
            this.logger.debug('UPIs fetched and cached');
            return { ...result };
        }
        catch (error) {
            this.logger.error('Error finding UPI data', error.stack);
            throw error;
        }
    }
    async update(updateClientDto) {
        if (!updateClientDto || typeof updateClientDto !== 'object') {
            throw new Error('Invalid update data provided');
        }
        try {
            const updateData = { ...updateClientDto };
            delete updateData._id;
            this.logger.debug('Updating UPI data...');
            const updatedUser = await this.executeWithRetry(async () => {
                return await this.upiIdModel.findOneAndUpdate({}, {
                    $set: {
                        ...updateData,
                        updatedAt: new Date()
                    }
                }, {
                    new: true,
                    upsert: true,
                    lean: true,
                    runValidators: true
                }).exec();
            });
            if (!updatedUser) {
                throw new common_1.NotFoundException('Failed to update UPI data');
            }
            this.upiIds = { ...updatedUser };
            this.logger.log('UPI data updated successfully');
            return { ...updatedUser };
        }
        catch (error) {
            this.logger.error('Error updating UPI data', error.stack);
            throw error;
        }
    }
    async executeWithRetry(operation, retries = this.MAX_RETRIES) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);
                if (attempt === retries) {
                    throw error;
                }
                const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        throw new Error('All retry attempts failed');
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getServiceStatus() {
        return {
            isInitialized: this.isInitialized,
            hasCachedData: this.upiIds !== null && Object.keys(this.upiIds).length > 0,
            lastUpdate: this.upiIds?.updatedAt
        };
    }
};
exports.UpiIdService = UpiIdService;
exports.UpiIdService = UpiIdService = UpiIdService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('UpiIdModule')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        npoint_service_1.NpointService])
], UpiIdService);
//# sourceMappingURL=upi-ids.service.js.map
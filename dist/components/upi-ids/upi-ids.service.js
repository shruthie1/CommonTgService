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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpiIdService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const npoint_service_1 = require("../n-point/npoint.service");
let UpiIdService = class UpiIdService {
    constructor(UpiIdModel, npointSerive) {
        this.UpiIdModel = UpiIdModel;
        this.npointSerive = npointSerive;
        this.checkInterval = null;
        this.upiIds = {};
        this.findOne().then(() => {
            this.checkInterval = setInterval(async () => {
                await this.refreshUPIs();
                await this.checkNpoint();
            }, 5 * 60000);
        });
    }
    onModuleDestroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
    onModuleInit() {
        console.log("UPI ID Service Initialized");
    }
    async refreshUPIs() {
        console.log("Refreshing UPIs");
        const result = await this.UpiIdModel.findOne({}).lean().exec();
        if (result) {
            this.upiIds = result;
        }
    }
    async checkNpoint() {
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
//# sourceMappingURL=upi-ids.service.js.map
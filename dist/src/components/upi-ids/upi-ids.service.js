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
exports.UpiIdService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("../../utils");
const npoint_service_1 = require("../n-point/npoint.service");
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
//# sourceMappingURL=upi-ids.service.js.map
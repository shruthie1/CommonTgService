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
exports.BuildService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const npoint_service_1 = require("../n-point/npoint.service");
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
//# sourceMappingURL=build.service.js.map
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
exports.PromoteMsgsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let PromoteMsgsService = class PromoteMsgsService {
    constructor(promotemsgModel) {
        this.promotemsgModel = promotemsgModel;
    }
    async OnModuleInit() {
        console.log("Config Module Inited");
    }
    async findOne() {
        var _a;
        const user = (_a = (await this.promotemsgModel.findOne({}, { _id: 0 }).exec())) === null || _a === void 0 ? void 0 : _a.toJSON();
        if (!user) {
            throw new common_1.NotFoundException(`promotemsgModel not found`);
        }
        return user;
    }
    async update(updateClientDto) {
        delete updateClientDto['_id'];
        const updatedUser = await this.promotemsgModel.findOneAndUpdate({}, { $set: Object.assign({}, updateClientDto) }, { new: true, upsert: true }).exec();
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
//# sourceMappingURL=promote-msgs.service.js.map
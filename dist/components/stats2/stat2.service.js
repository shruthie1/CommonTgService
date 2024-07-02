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
exports.Stat2Service = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
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
//# sourceMappingURL=stat2.service.js.map
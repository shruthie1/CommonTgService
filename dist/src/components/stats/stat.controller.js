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
exports.StatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const stat_service_1 = require("./stat.service");
const create_stat_dto_1 = require("./create-stat.dto");
const update_stat_dto_1 = require("./update-stat.dto");
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
//# sourceMappingURL=stat.controller.js.map
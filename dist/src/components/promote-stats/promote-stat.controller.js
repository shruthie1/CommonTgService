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
exports.PromoteStatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const promote_stat_service_1 = require("./promote-stat.service");
const create_promote_stat_dto_1 = require("./dto/create-promote-stat.dto");
const update_promote_stat_dto_1 = require("./dto/update-promote-stat.dto");
let PromoteStatController = class PromoteStatController {
    constructor(promoteStatService) {
        this.promoteStatService = promoteStatService;
    }
    async create(createPromoteStatDto) {
        return this.promoteStatService.create(createPromoteStatDto);
    }
    async findByClient(client) {
        return this.promoteStatService.findByClient(client);
    }
    async update(client, updatePromoteStatDto) {
        return this.promoteStatService.update(client, updatePromoteStatDto);
    }
    async deleteOne(client) {
        return this.promoteStatService.deleteOne(client);
    }
    async deleteAll() {
        return this.promoteStatService.deleteAll();
    }
};
exports.PromoteStatController = PromoteStatController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_promote_stat_dto_1.CreatePromoteStatDto]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "findByClient", null);
__decorate([
    (0, common_1.Put)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_promote_stat_dto_1.UpdatePromoteStatDto]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':client'),
    __param(0, (0, common_1.Param)('client')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Delete)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PromoteStatController.prototype, "deleteAll", null);
exports.PromoteStatController = PromoteStatController = __decorate([
    (0, swagger_1.ApiTags)('promote-stats'),
    (0, common_1.Controller)('promote-stats'),
    __metadata("design:paramtypes", [promote_stat_service_1.PromoteStatService])
], PromoteStatController);
//# sourceMappingURL=promote-stat.controller.js.map
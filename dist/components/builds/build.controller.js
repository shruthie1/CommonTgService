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
exports.BuildController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const build_service_1 = require("./build.service");
const decorators_1 = require("../../decorators");
const interceptors_1 = require("../../interceptors");
let BuildController = class BuildController {
    constructor(buildService) {
        this.buildService = buildService;
    }
    async findOne() {
        return this.buildService.findOne();
    }
    async update(updateClientDto) {
        return this.buildService.update(updateClientDto);
    }
};
exports.BuildController = BuildController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseInterceptors)(interceptors_1.CloudflareCacheInterceptor),
    (0, decorators_1.CloudflareCache)(3600, 60),
    (0, swagger_1.ApiOperation)({ summary: 'Get build data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BuildController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update build' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BuildController.prototype, "update", null);
exports.BuildController = BuildController = __decorate([
    (0, swagger_1.ApiTags)('Build'),
    (0, common_1.Controller)('builds'),
    __metadata("design:paramtypes", [build_service_1.BuildService])
], BuildController);
//# sourceMappingURL=build.controller.js.map
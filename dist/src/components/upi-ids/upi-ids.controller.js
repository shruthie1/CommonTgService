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
exports.UpiIdController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const upi_ids_service_1 = require("./upi-ids.service");
let UpiIdController = class UpiIdController {
    constructor(UpiIdService) {
        this.UpiIdService = UpiIdService;
    }
    async findOne() {
        return this.UpiIdService.findOne();
    }
    async update(updateUpiIdsdto) {
        return this.UpiIdService.update(updateUpiIdsdto);
    }
};
exports.UpiIdController = UpiIdController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get Upi Ids' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UpiIdController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update Upi Ids' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UpiIdController.prototype, "update", null);
exports.UpiIdController = UpiIdController = __decorate([
    (0, swagger_1.ApiTags)('UPI Ids'),
    (0, common_1.Controller)('upi-ids'),
    __metadata("design:paramtypes", [upi_ids_service_1.UpiIdService])
], UpiIdController);
//# sourceMappingURL=upi-ids.controller.js.map
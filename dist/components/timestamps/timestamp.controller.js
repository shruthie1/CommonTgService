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
exports.TimestampController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const timestamp_service_1 = require("./timestamp.service");
let TimestampController = class TimestampController {
    constructor(timestampService) {
        this.timestampService = timestampService;
    }
    async findOne() {
        return this.timestampService.findOne();
    }
    async getClientsWithTimeDifference(thresholdMinutes) {
        const threshold = thresholdMinutes ? thresholdMinutes * 60 * 1000 : 3 * 60 * 1000;
        return this.timestampService.getClientsWithTimeDifference(threshold);
    }
    async update(updateTimestampDto) {
        return this.timestampService.update(updateTimestampDto);
    }
};
exports.TimestampController = TimestampController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get timestamp data' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('stalled'),
    (0, swagger_1.ApiOperation)({ summary: 'Get clients with time differences greater than threshold' }),
    (0, swagger_1.ApiQuery)({
        name: 'threshold',
        type: Number,
        required: false,
        description: 'Minimum time difference in minutes (default: 3)'
    }),
    __param(0, (0, common_1.Query)('threshold')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "getClientsWithTimeDifference", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Update timestamp data' }),
    (0, swagger_1.ApiBody)({ type: Object }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TimestampController.prototype, "update", null);
exports.TimestampController = TimestampController = __decorate([
    (0, swagger_1.ApiTags)('Timestamps'),
    (0, common_1.Controller)('timestamps'),
    __metadata("design:paramtypes", [timestamp_service_1.TimestampService])
], TimestampController);
//# sourceMappingURL=timestamp.controller.js.map
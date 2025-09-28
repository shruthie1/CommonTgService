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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatStatisticsDto = exports.ConnectionStatusDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ConnectionStatusDto {
}
exports.ConnectionStatusDto = ConnectionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of active connections' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "activeConnections", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of rate-limited connections' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "rateLimited", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of operations' }),
    __metadata("design:type", Number)
], ConnectionStatusDto.prototype, "totalOperations", void 0);
class ChatStatisticsDto {
}
exports.ChatStatisticsDto = ChatStatisticsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total message count' }),
    __metadata("design:type", Number)
], ChatStatisticsDto.prototype, "totalMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Active member count' }),
    __metadata("design:type", Number)
], ChatStatisticsDto.prototype, "activeMembers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message count by type' }),
    __metadata("design:type", Object)
], ChatStatisticsDto.prototype, "messageTypes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Most active hours', type: [Number] }),
    __metadata("design:type", Array)
], ChatStatisticsDto.prototype, "activeHours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Activity trend percentage' }),
    __metadata("design:type", Number)
], ChatStatisticsDto.prototype, "activityTrend", void 0);
//# sourceMappingURL=common-responses.dto.js.map
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
exports.UsageStatisticsDto = exports.BulkEnrollPromoteClientsRequestDto = exports.BulkEnrollBufferClientsRequestDto = exports.BulkEnrollClientsRequestDto = exports.MarkUsedRequestDto = exports.DeactivationRequestDto = exports.ActivationRequestDto = exports.StatusUpdateRequestDto = exports.AcceptedStringResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AcceptedStringResponseDto {
}
exports.AcceptedStringResponseDto = AcceptedStringResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Acknowledgement returned when a long-running background operation is started.',
        example: 'initiated Checking',
    }),
    __metadata("design:type", String)
], AcceptedStringResponseDto.prototype, "message", void 0);
class StatusUpdateRequestDto {
}
exports.StatusUpdateRequestDto = StatusUpdateRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Lifecycle status to assign to the client record.',
        enum: ['active', 'inactive'],
        example: 'active',
    }),
    __metadata("design:type", String)
], StatusUpdateRequestDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional operator note explaining why the status changed.',
        example: 'Re-enabled after manual review',
    }),
    __metadata("design:type", String)
], StatusUpdateRequestDto.prototype, "message", void 0);
class ActivationRequestDto {
}
exports.ActivationRequestDto = ActivationRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional operator note recorded when activating the client.',
        example: 'Returned to active pool',
    }),
    __metadata("design:type", String)
], ActivationRequestDto.prototype, "message", void 0);
class DeactivationRequestDto {
}
exports.DeactivationRequestDto = DeactivationRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Reason for deactivating the client.',
        example: 'Health check failed repeatedly',
    }),
    __metadata("design:type", String)
], DeactivationRequestDto.prototype, "reason", void 0);
class MarkUsedRequestDto {
}
exports.MarkUsedRequestDto = MarkUsedRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional note describing where or why the client was consumed.',
        example: 'Assigned to live campaign rotation',
    }),
    __metadata("design:type", String)
], MarkUsedRequestDto.prototype, "message", void 0);
class BulkEnrollClientsRequestDto {
}
exports.BulkEnrollClientsRequestDto = BulkEnrollClientsRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Candidate user identifiers that passed upstream validation.',
        type: [String],
        example: ['10001', '10002'],
    }),
    __metadata("design:type", Array)
], BulkEnrollClientsRequestDto.prototype, "goodIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Candidate user identifiers that failed upstream validation and should be excluded.',
        type: [String],
        example: ['99999'],
    }),
    __metadata("design:type", Array)
], BulkEnrollClientsRequestDto.prototype, "badIds", void 0);
class BulkEnrollBufferClientsRequestDto extends BulkEnrollClientsRequestDto {
}
exports.BulkEnrollBufferClientsRequestDto = BulkEnrollBufferClientsRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Specific client IDs that currently need more buffer accounts.',
        type: [String],
        example: ['client-a', 'client-b'],
    }),
    __metadata("design:type", Array)
], BulkEnrollBufferClientsRequestDto.prototype, "clientsNeedingBufferClients", void 0);
class BulkEnrollPromoteClientsRequestDto extends BulkEnrollClientsRequestDto {
}
exports.BulkEnrollPromoteClientsRequestDto = BulkEnrollPromoteClientsRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Specific client IDs that currently need more promote accounts.',
        type: [String],
        example: ['client-a', 'client-b'],
    }),
    __metadata("design:type", Array)
], BulkEnrollPromoteClientsRequestDto.prototype, "clientsNeedingPromoteClients", void 0);
class UsageStatisticsDto {
}
exports.UsageStatisticsDto = UsageStatisticsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of matching client records.', example: 48 }),
    __metadata("design:type", Number)
], UsageStatisticsDto.prototype, "totalClients", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Matching clients that have never been used.', example: 12 }),
    __metadata("design:type", Number)
], UsageStatisticsDto.prototype, "neverUsed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Matching clients used within the last 24 hours.', example: 6 }),
    __metadata("design:type", Number)
], UsageStatisticsDto.prototype, "usedInLast24Hours", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Matching clients used within the last 7 days.', example: 21 }),
    __metadata("design:type", Number)
], UsageStatisticsDto.prototype, "usedInLastWeek", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Average time gap between usages, in hours.',
        example: 37.5,
    }),
    __metadata("design:type", Number)
], UsageStatisticsDto.prototype, "averageUsageGap", void 0);
//# sourceMappingURL=client-swagger.dto.js.map
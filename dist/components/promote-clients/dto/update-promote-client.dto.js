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
exports.UpdatePromoteClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_promote_client_dto_1 = require("./create-promote-client.dto");
const class_validator_1 = require("class-validator");
const warmup_phases_1 = require("../../shared/warmup-phases");
class UpdatePromoteClientDto extends (0, swagger_1.PartialType)(create_promote_client_dto_1.CreatePromoteClientDto) {
}
exports.UpdatePromoteClientDto = UpdatePromoteClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the client is currently reserved by an active workflow.', example: false }),
    __metadata("design:type", Boolean)
], UpdatePromoteClientDto.prototype, "inUse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the client was last used.', example: '2026-04-01T10:30:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when privacy settings were updated.', example: '2026-03-10T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "privacyUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the final profile photo was uploaded.', example: '2026-03-28T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "profilePicsUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when display name and bio were updated.', example: '2026-03-18T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "nameBioUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when legacy profile photos were deleted.', example: '2026-03-14T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "profilePicsDeletedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when username was updated or cleared.', example: '2026-03-20T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "usernameUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent health check.', example: '2026-04-02T09:15:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent warmup processing attempt.', example: '2026-04-03T10:30:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "lastUpdateAttempt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Current consecutive warmup failure count.', example: 1 }),
    __metadata("design:type", Number)
], UpdatePromoteClientDto.prototype, "failedUpdateAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the last failed warmup attempt.', example: '2026-04-01T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "lastUpdateFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when 2FA was verified or configured.', example: '2026-03-12T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "twoFASetAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when other sessions were revoked.', example: '2026-03-15T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "otherAuthsRemovedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'], example: 'growing' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(warmup_phases_1.WarmupPhase),
    __metadata("design:type", String)
], UpdatePromoteClientDto.prototype, "warmupPhase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Per-account warmup jitter in days.', example: 2 }),
    __metadata("design:type", Number)
], UpdatePromoteClientDto.prototype, "warmupJitter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the account entered warmup enrollment.', example: '2026-03-03T08:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "enrolledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the latest organic activity execution.', example: '2026-04-03T09:45:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "organicActivityAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when a backup session was created.', example: '2026-04-02T07:00:00.000Z' }),
    __metadata("design:type", Date)
], UpdatePromoteClientDto.prototype, "sessionRotatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned first name (set during setupClient)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdatePromoteClientDto.prototype, "assignedFirstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned last name', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdatePromoteClientDto.prototype, "assignedLastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned bio', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdatePromoteClientDto.prototype, "assignedBio", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned profile pic URLs', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdatePromoteClientDto.prototype, "assignedProfilePics", void 0);
//# sourceMappingURL=update-promote-client.dto.js.map
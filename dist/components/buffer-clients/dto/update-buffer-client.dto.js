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
exports.UpdateBufferClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_buffer_client_dto_1 = require("./create-buffer-client.dto");
const class_validator_1 = require("class-validator");
const warmup_phases_1 = require("../../shared/warmup-phases");
class UpdateBufferClientDto extends (0, swagger_1.PartialType)(create_buffer_client_dto_1.CreateBufferClientDto) {
}
exports.UpdateBufferClientDto = UpdateBufferClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether the client is currently reserved by an active workflow.' }),
    __metadata("design:type", Boolean)
], UpdateBufferClientDto.prototype, "inUse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the client was last used.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when privacy settings were updated.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "privacyUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the final profile photo was uploaded.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "profilePicsUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when display name and bio were updated.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "nameBioUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when legacy profile photos were deleted.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "profilePicsDeletedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Username set during warmup.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBufferClientDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when username was updated.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "usernameUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent health check.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent warmup processing attempt.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "lastUpdateAttempt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Current consecutive warmup failure count.' }),
    __metadata("design:type", Number)
], UpdateBufferClientDto.prototype, "failedUpdateAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the last failed warmup attempt.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "lastUpdateFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when 2FA was verified or configured.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "twoFASetAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when other sessions were revoked.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "otherAuthsRemovedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(warmup_phases_1.WarmupPhase),
    __metadata("design:type", String)
], UpdateBufferClientDto.prototype, "warmupPhase", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Per-account warmup jitter in days.' }),
    __metadata("design:type", Number)
], UpdateBufferClientDto.prototype, "warmupJitter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the account entered warmup enrollment.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "enrolledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the latest organic activity execution.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "organicActivityAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when a backup session was created.' }),
    __metadata("design:type", Date)
], UpdateBufferClientDto.prototype, "sessionRotatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Assigned first name (set during setupClient)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBufferClientDto.prototype, "assignedFirstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Assigned last name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBufferClientDto.prototype, "assignedLastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Assigned bio' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBufferClientDto.prototype, "assignedBio", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Assigned profile pic URLs' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateBufferClientDto.prototype, "assignedProfilePics", void 0);
//# sourceMappingURL=update-buffer-client.dto.js.map
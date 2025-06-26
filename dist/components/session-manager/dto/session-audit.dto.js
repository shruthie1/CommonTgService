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
exports.SessionAuditStatsDto = exports.SessionAuditQueryDto = exports.UpdateSessionAuditDto = exports.CreateSessionAuditDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const sessions_schema_1 = require("../schemas/sessions.schema");
class CreateSessionAuditDto {
}
exports.CreateSessionAuditDto = CreateSessionAuditDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Phone number associated with the session' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==...', description: 'Session string', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "sessionString", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'old_session', description: 'Method used to create the session', enum: sessions_schema_1.SessionCreationMethod }),
    (0, class_validator_1.IsEnum)(sessions_schema_1.SessionCreationMethod),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "creationMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Session created successfully', description: 'Creation message', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "creationMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==...', description: 'Previous session string', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "previousSessionString", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Username', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSessionAuditDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3, description: 'Number of retry attempts', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateSessionAuditDto.prototype, "retryAttempts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: {}, description: 'Additional metadata', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateSessionAuditDto.prototype, "metadata", void 0);
class UpdateSessionAuditDto {
}
exports.UpdateSessionAuditDto = UpdateSessionAuditDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==...', description: 'Session string to update', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "sessionString", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Session status', enum: sessions_schema_1.SessionStatus, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(sessions_schema_1.SessionStatus),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Username', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Session validation failed', description: 'Error message', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "errorMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'manual_revocation', description: 'Revocation reason', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "revocationReason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Whether session is active', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSessionAuditDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5, description: 'Usage count', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateSessionAuditDto.prototype, "usageCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'session_validation_failed', description: 'Last error', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateSessionAuditDto.prototype, "lastError", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T16:00:00Z', description: 'When the session was revoked', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    __metadata("design:type", Date)
], UpdateSessionAuditDto.prototype, "revokedAt", void 0);
class SessionAuditQueryDto {
}
exports.SessionAuditQueryDto = SessionAuditQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Phone number to filter by', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SessionAuditQueryDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Status to filter by', enum: sessions_schema_1.SessionStatus, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(sessions_schema_1.SessionStatus),
    __metadata("design:type", String)
], SessionAuditQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'old_session', description: 'Creation method to filter by', enum: sessions_schema_1.SessionCreationMethod, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(sessions_schema_1.SessionCreationMethod),
    __metadata("design:type", String)
], SessionAuditQueryDto.prototype, "creationMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Filter by active sessions only', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SessionAuditQueryDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: 'Number of records to return', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SessionAuditQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: 'Number of records to skip', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SessionAuditQueryDto.prototype, "offset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01', description: 'Filter sessions created after this date', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    __metadata("design:type", Date)
], SessionAuditQueryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-31', description: 'Filter sessions created before this date', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Date),
    (0, class_validator_1.IsDate)(),
    __metadata("design:type", Date)
], SessionAuditQueryDto.prototype, "endDate", void 0);
class SessionAuditStatsDto {
}
exports.SessionAuditStatsDto = SessionAuditStatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 150, description: 'Total number of sessions' }),
    __metadata("design:type", Number)
], SessionAuditStatsDto.prototype, "totalSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 45, description: 'Number of active sessions' }),
    __metadata("design:type", Number)
], SessionAuditStatsDto.prototype, "activeSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 30, description: 'Number of expired sessions' }),
    __metadata("design:type", Number)
], SessionAuditStatsDto.prototype, "expiredSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 20, description: 'Number of revoked sessions' }),
    __metadata("design:type", Number)
], SessionAuditStatsDto.prototype, "revokedSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 55, description: 'Number of failed sessions' }),
    __metadata("design:type", Number)
], SessionAuditStatsDto.prototype, "failedSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: { old_session: 80, existing_method: 50, fallback: 20 },
        description: 'Breakdown by creation method'
    }),
    __metadata("design:type", Object)
], SessionAuditStatsDto.prototype, "creationMethodBreakdown", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T10:00:00Z', description: 'Date range start' }),
    __metadata("design:type", Object)
], SessionAuditStatsDto.prototype, "dateRange", void 0);
//# sourceMappingURL=session-audit.dto.js.map
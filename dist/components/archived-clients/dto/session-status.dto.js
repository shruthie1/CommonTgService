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
exports.SessionStatusDto = exports.SessionHealthMetricsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SessionHealthMetricsDto {
}
exports.SessionHealthMetricsDto = SessionHealthMetricsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 2,
        description: 'Number of active old sessions available as backup'
    }),
    __metadata("design:type", Number)
], SessionHealthMetricsDto.prototype, "activeOldSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '2024-01-15T08:30:00.000Z',
        description: 'Timestamp when the session was last updated'
    }),
    __metadata("design:type", String)
], SessionHealthMetricsDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '2 hours ago',
        description: 'Human-readable session age'
    }),
    __metadata("design:type", String)
], SessionHealthMetricsDto.prototype, "sessionAge", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'high',
        description: 'Session reliability rating based on availability',
        enum: ['high', 'medium', 'low']
    }),
    __metadata("design:type", String)
], SessionHealthMetricsDto.prototype, "reliability", void 0);
class SessionStatusDto {
}
exports.SessionStatusDto = SessionStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '916265240911',
        description: 'Mobile number of the archived client'
    }),
    __metadata("design:type", String)
], SessionStatusDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: 'Whether the main session is currently active'
    }),
    __metadata("design:type", Boolean)
], SessionStatusDto.prototype, "isMainSessionActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 3,
        description: 'Total number of old sessions stored'
    }),
    __metadata("design:type", Number)
], SessionStatusDto.prototype, "totalOldSessions", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '2024-01-15T10:30:00.000Z',
        description: 'Timestamp when the status was last checked'
    }),
    __metadata("design:type", String)
], SessionStatusDto.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Detailed health metrics for the session',
        type: SessionHealthMetricsDto
    }),
    __metadata("design:type", SessionHealthMetricsDto)
], SessionStatusDto.prototype, "healthMetrics", void 0);
//# sourceMappingURL=session-status.dto.js.map
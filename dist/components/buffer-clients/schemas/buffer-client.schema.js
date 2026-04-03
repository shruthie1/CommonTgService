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
exports.BufferClientSchema = exports.BufferClient = void 0;
const swagger_1 = require("@nestjs/swagger");
const mongoose_1 = require("@nestjs/mongoose");
let BufferClient = class BufferClient {
};
exports.BufferClient = BufferClient;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram account identifier.', example: '123456789' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique mobile number for the Telegram account.', example: '+15551234567' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Session string currently stored for this buffer client.', example: '1AQAOMT...' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date when this client becomes available for assignment.', example: '2026-04-03' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current joined channel count.', example: 187 }),
    (0, mongoose_1.Prop)({ required: true, type: Number }),
    __metadata("design:type", Number)
], BufferClient.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Owning main client identifier.', example: 'client-a' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Operational note attached to the client.', example: 'Enrolled for warmup' }),
    (0, mongoose_1.Prop)({ required: false, default: 'Account is functioning properly' }),
    __metadata("design:type", String)
], BufferClient.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when this account was last consumed by live usage.', example: '2026-04-01T12:30:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent periodic health check.', example: '2026-04-02T09:15:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operational status for the record.', enum: ['active', 'inactive'], example: 'active' }),
    (0, mongoose_1.Prop)({
        required: true,
        enum: ['active', 'inactive'],
        default: 'active',
        type: String,
        description: 'Status of the buffer client',
    }),
    __metadata("design:type", String)
], BufferClient.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether the account is currently reserved by an active workflow.', example: false }),
    (0, mongoose_1.Prop)({ required: false, type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], BufferClient.prototype, "inUse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when privacy settings were updated during warmup.', example: '2026-03-10T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "privacyUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the final profile photo was uploaded.', example: '2026-03-28T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "profilePicsUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when display name and bio were updated.', example: '2026-03-18T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "nameBioUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when legacy profile photos were removed.', example: '2026-03-14T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "profilePicsDeletedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when username was updated.', example: '2026-03-20T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "usernameUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record creation timestamp.', example: '2026-03-01T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record last update timestamp.', example: '2026-04-03T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent warmup processing attempt.', example: '2026-04-03T10:30:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUpdateAttempt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current consecutive warmup failure count.', example: 0, default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], BufferClient.prototype, "failedUpdateAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the last failed warmup attempt.', example: '2026-04-01T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUpdateFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when 2FA was verified or configured.', example: '2026-03-12T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "twoFASetAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when other Telegram sessions were revoked.', example: '2026-03-15T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "otherAuthsRemovedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Current warmup lifecycle phase.',
        enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
        example: 'growing',
    }),
    (0, mongoose_1.Prop)({
        required: false,
        type: String,
        enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
        default: null,
    }),
    __metadata("design:type", String)
], BufferClient.prototype, "warmupPhase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Per-account warmup jitter in days.', example: 2, default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], BufferClient.prototype, "warmupJitter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the account entered warmup enrollment.', example: '2026-03-03T08:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "enrolledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the latest organic activity execution.', example: '2026-04-03T09:45:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "organicActivityAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when a backup session was created and recorded.', example: '2026-04-02T07:00:00.000Z' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "sessionRotatedAt", void 0);
exports.BufferClient = BufferClient = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'bufferClients', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], BufferClient);
exports.BufferClientSchema = mongoose_1.SchemaFactory.createForClass(BufferClient);
//# sourceMappingURL=buffer-client.schema.js.map
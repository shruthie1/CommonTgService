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
exports.SessionAuditSchema = exports.SessionAudit = exports.SessionCreationMethod = exports.SessionStatus = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["CREATED"] = "created";
    SessionStatus["ACTIVE"] = "active";
    SessionStatus["EXPIRED"] = "expired";
    SessionStatus["REVOKED"] = "revoked";
    SessionStatus["FAILED"] = "failed";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
var SessionCreationMethod;
(function (SessionCreationMethod) {
    SessionCreationMethod["OLD_SESSION"] = "old_session";
    SessionCreationMethod["USER_MOBILE"] = "user_mobile";
    SessionCreationMethod["INPUT_SESSION"] = "input_session";
})(SessionCreationMethod || (exports.SessionCreationMethod = SessionCreationMethod = {}));
let SessionAudit = class SessionAudit {
};
exports.SessionAudit = SessionAudit;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Phone number associated with the session' }),
    (0, mongoose_1.Prop)({ required: true, index: true }),
    __metadata("design:type", String)
], SessionAudit.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==...', description: 'Encrypted session string' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "sessionString", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Current status of the session', enum: SessionStatus }),
    (0, mongoose_1.Prop)({ required: true, enum: SessionStatus, default: SessionStatus.CREATED }),
    __metadata("design:type", String)
], SessionAudit.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'old_session', description: 'Method used to create the session', enum: SessionCreationMethod }),
    (0, mongoose_1.Prop)({ required: true, enum: SessionCreationMethod }),
    __metadata("design:type", String)
], SessionAudit.prototype, "creationMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Session created successfully', description: 'Creation success/failure message' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "creationMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1BQANOTEuM==...', description: 'Previous session string used for creation (if applicable)' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "previousSessionString", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T10:00:00Z', description: 'When the session was created' }),
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], SessionAudit.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T15:30:00Z', description: 'Last time the session was used' }),
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], SessionAudit.prototype, "lastUsedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2024-01-01T10:00:00Z', description: 'When the session expires' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], SessionAudit.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID associated with this session' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ShruthiRedd2', description: 'Username associated with this session' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3, description: 'Number of retry attempts during creation' }),
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], SessionAudit.prototype, "retryAttempts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Rate limit exceeded', description: 'Error message if creation failed' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "errorMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: { userAgent: 'Telegram-Desktop/1.0', ipAddress: '192.168.1.1' },
        description: 'Additional metadata about session creation'
    }),
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], SessionAudit.prototype, "metadata", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Whether this session is currently active' }),
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], SessionAudit.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T16:00:00Z', description: 'When the session was revoked/expired' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], SessionAudit.prototype, "revokedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'manual_revocation', description: 'Reason for session revocation' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "revocationReason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5, description: 'Number of times this session has been used' }),
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], SessionAudit.prototype, "usageCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'session_validation_failed', description: 'Last known error with this session' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SessionAudit.prototype, "lastError", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2023-12-01T15:45:00Z', description: 'When the last error occurred' }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], SessionAudit.prototype, "lastErrorAt", void 0);
exports.SessionAudit = SessionAudit = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'session_audits',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
                delete ret.__v;
            },
        },
    })
], SessionAudit);
exports.SessionAuditSchema = mongoose_1.SchemaFactory.createForClass(SessionAudit);
exports.SessionAuditSchema.index({ mobile: 1, createdAt: -1 });
exports.SessionAuditSchema.index({ status: 1, isActive: 1 });
exports.SessionAuditSchema.index({ createdAt: -1 });
exports.SessionAuditSchema.index({ lastUsedAt: -1 });
exports.SessionAuditSchema.index({ mobile: 1, isActive: 1, status: 1 });
exports.SessionAuditSchema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    if (update.$set && !update.$set.lastUsedAt) {
        update.$set.lastUsedAt = new Date();
    }
});
//# sourceMappingURL=sessions.schema.js.map
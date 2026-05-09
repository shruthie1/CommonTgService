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
exports.PromoteClientSchema = exports.PromoteClient = void 0;
const swagger_1 = require("@nestjs/swagger");
const mongoose_1 = require("@nestjs/mongoose");
const mobile_utils_1 = require("../../shared/mobile-utils");
let PromoteClient = class PromoteClient {
};
exports.PromoteClient = PromoteClient;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram account identifier.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique mobile number for the Telegram account.' }),
    (0, mongoose_1.Prop)({ required: true, unique: true, set: mobile_utils_1.canonicalizeMobile }),
    __metadata("design:type", String)
], PromoteClient.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Provider-specific last-active indicator recorded for the source user.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date when this client becomes available for assignment.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], PromoteClient.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current joined channel count.' }),
    (0, mongoose_1.Prop)({ required: true, type: Number }),
    __metadata("design:type", Number)
], PromoteClient.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Owning main client identifier.' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], PromoteClient.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operational status for the record.' }),
    (0, mongoose_1.Prop)({ required: false, default: 'active' }),
    __metadata("design:type", String)
], PromoteClient.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Operational note attached to the client.' }),
    (0, mongoose_1.Prop)({ required: false, default: 'Account is functioning properly' }),
    __metadata("design:type", String)
], PromoteClient.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when this account was last consumed by live usage.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when privacy settings were updated during warmup.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "privacyUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the final profile photo was uploaded.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "profilePicsUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when display name and bio were updated.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "nameBioUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when legacy profile photos were removed.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "profilePicsDeletedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when username was updated or cleared.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "usernameUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record creation timestamp.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record last update timestamp.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent periodic health check.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent warmup processing attempt.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "lastUpdateAttempt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current consecutive warmup failure count.', default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], PromoteClient.prototype, "failedUpdateAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the last failed warmup attempt.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "lastUpdateFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Session string currently stored for this promote client.' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], PromoteClient.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether the account is currently reserved by an active workflow.' }),
    (0, mongoose_1.Prop)({ required: false, type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], PromoteClient.prototype, "inUse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when 2FA was verified or configured.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "twoFASetAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when other Telegram sessions were revoked.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "otherAuthsRemovedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Current warmup lifecycle phase.',
        enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated']
    }),
    (0, mongoose_1.Prop)({
        required: false,
        type: String,
        enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'],
        default: null
    }),
    __metadata("design:type", String)
], PromoteClient.prototype, "warmupPhase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Per-account warmup jitter in days.', default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], PromoteClient.prototype, "warmupJitter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the account entered warmup enrollment.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "enrolledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the latest organic activity execution.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "organicActivityAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when a backup session was created and recorded.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], PromoteClient.prototype, "sessionRotatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned first name from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], PromoteClient.prototype, "assignedFirstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned last name from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], PromoteClient.prototype, "assignedLastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned bio from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], PromoteClient.prototype, "assignedBio", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned profile pic URLs from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], PromoteClient.prototype, "assignedProfilePics", void 0);
exports.PromoteClient = PromoteClient = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'promoteClients', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            }
        }
    })
], PromoteClient);
exports.PromoteClientSchema = mongoose_1.SchemaFactory.createForClass(PromoteClient);
exports.PromoteClientSchema.index({ clientId: 1 });
//# sourceMappingURL=promote-client.schema.js.map
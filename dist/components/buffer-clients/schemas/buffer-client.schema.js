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
    (0, swagger_1.ApiProperty)({ description: 'Telegram account identifier.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique mobile number for the Telegram account.' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Session string currently stored for this buffer client.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date when this client becomes available for assignment.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "availableDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current joined channel count.' }),
    (0, mongoose_1.Prop)({ required: true, type: Number }),
    __metadata("design:type", Number)
], BufferClient.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Owning main client identifier.' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], BufferClient.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Operational note attached to the client.' }),
    (0, mongoose_1.Prop)({ required: false, default: 'Account is functioning properly' }),
    __metadata("design:type", String)
], BufferClient.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when this account was last consumed by live usage.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent periodic health check.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastChecked", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operational status for the record.', enum: ['active', 'inactive'] }),
    (0, mongoose_1.Prop)({
        required: true,
        enum: ['active', 'inactive'],
        default: 'active',
        type: String,
        description: 'Status of the buffer client'
    }),
    __metadata("design:type", String)
], BufferClient.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether the account is currently reserved by an active workflow.' }),
    (0, mongoose_1.Prop)({ required: false, type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], BufferClient.prototype, "inUse", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when privacy settings were updated during warmup.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "privacyUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the final profile photo was uploaded.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "profilePicsUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when display name and bio were updated.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "nameBioUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when legacy profile photos were removed.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "profilePicsDeletedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Username set during warmup identity phase.' }),
    (0, mongoose_1.Prop)({ required: false, type: String, default: null }),
    __metadata("design:type", String)
], BufferClient.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when username was updated.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "usernameUpdatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record creation timestamp.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Record last update timestamp.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the most recent warmup processing attempt.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUpdateAttempt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current consecutive warmup failure count.', default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], BufferClient.prototype, "failedUpdateAttempts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the last failed warmup attempt.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "lastUpdateFailure", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when 2FA was verified or configured.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "twoFASetAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when other Telegram sessions were revoked.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "otherAuthsRemovedAt", void 0);
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
], BufferClient.prototype, "warmupPhase", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Per-account warmup jitter in days.', default: 0 }),
    (0, mongoose_1.Prop)({ required: false, type: Number, default: 0 }),
    __metadata("design:type", Number)
], BufferClient.prototype, "warmupJitter", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when the account entered warmup enrollment.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "enrolledAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp of the latest organic activity execution.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "organicActivityAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Timestamp when a backup session was created and recorded.' }),
    (0, mongoose_1.Prop)({ required: false, type: Date, default: null }),
    __metadata("design:type", Date)
], BufferClient.prototype, "sessionRotatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned first name from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], BufferClient.prototype, "assignedFirstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned last name from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], BufferClient.prototype, "assignedLastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned bio from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], BufferClient.prototype, "assignedBio", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Assigned profile pic URLs from pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], BufferClient.prototype, "assignedProfilePics", void 0);
exports.BufferClient = BufferClient = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'bufferClients', versionKey: false, autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            }
        }
    })
], BufferClient);
exports.BufferClientSchema = mongoose_1.SchemaFactory.createForClass(BufferClient);
exports.BufferClientSchema.index({ clientId: 1 }, {
    unique: true,
    partialFilterExpression: {
        clientId: { $type: 'string' },
        inUse: true
    }
});
//# sourceMappingURL=buffer-client.schema.js.map
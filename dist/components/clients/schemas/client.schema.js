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
exports.ClientSchema = exports.Client = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let Client = class Client {
};
exports.Client = Client;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Channel link' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "channelLink", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Database collection name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "dbcoll", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client link' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Display name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], Client.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '2FA password' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'tg-aut repl link' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "repl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Promote repl link' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "promoteRepl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram session string' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram username' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique client identifier' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], Client.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Deploy restart URL' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "deployKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Product identifier' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Paytm QR ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "qrId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Google Pay ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Client.prototype, "gpayId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Dedicated proxy IPs', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "dedicatedIps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Preferred IP country (ISO 2-letter)', required: false }),
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], Client.prototype, "preferredIpCountry", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Auto-assign IPs to mobile numbers', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], Client.prototype, "autoAssignIps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'First name pool for persona assignment', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "firstNames", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last name pool for buffer clients', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "bufferLastNames", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last name pool for promote clients', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "promoteLastNames", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Bio pool for persona assignment', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "bios", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile pic URL pool', required: false }),
    (0, mongoose_1.Prop)({ required: false, type: [String], default: [] }),
    __metadata("design:type", Array)
], Client.prototype, "profilePics", void 0);
exports.Client = Client = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'clients', versionKey: false, autoIndex: true, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Client);
exports.ClientSchema = mongoose_1.SchemaFactory.createForClass(Client);
//# sourceMappingURL=client.schema.js.map
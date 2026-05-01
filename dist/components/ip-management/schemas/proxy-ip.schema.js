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
exports.ProxyIpSchema = exports.ProxyIp = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let ProxyIp = class ProxyIp {
};
exports.ProxyIp = ProxyIp;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the proxy' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], ProxyIp.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Port number of the proxy' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], ProxyIp.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Protocol type (http, https, socks5)', enum: ['http', 'https', 'socks5'] }),
    (0, mongoose_1.Prop)({ required: true, enum: ['http', 'https', 'socks5'] }),
    __metadata("design:type", String)
], ProxyIp.prototype, "protocol", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Username for proxy authentication' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Password for proxy authentication' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Status of the proxy IP', enum: ['active', 'inactive'] }),
    (0, mongoose_1.Prop)({ required: true, default: 'active', enum: ['active', 'inactive'] }),
    __metadata("design:type", String)
], ProxyIp.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether this IP is currently assigned to a mobile number' }),
    (0, mongoose_1.Prop)({ required: false, default: false }),
    __metadata("design:type", Boolean)
], ProxyIp.prototype, "isAssigned", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client ID that owns this IP' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "assignedToClient", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source of the proxy', enum: ['manual', 'webshare'] }),
    (0, mongoose_1.Prop)({ required: false, default: 'manual', enum: ['manual', 'webshare'] }),
    __metadata("design:type", String)
], ProxyIp.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Webshare proxy ID for replacement API' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "webshareId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ISO 3166-1 two-letter country code' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'City name of the proxy location' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", String)
], ProxyIp.prototype, "cityName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last time the proxy was verified healthy' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Date)
], ProxyIp.prototype, "lastVerified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last time the proxy was served via getNextIp' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Date)
], ProxyIp.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of consecutive health check failures' }),
    (0, mongoose_1.Prop)({ required: false, default: 0 }),
    __metadata("design:type", Number)
], ProxyIp.prototype, "consecutiveFails", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Index used for round-robin ordering' }),
    (0, mongoose_1.Prop)({ required: false, default: 0 }),
    __metadata("design:type", Number)
], ProxyIp.prototype, "roundRobinIndex", void 0);
exports.ProxyIp = ProxyIp = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'proxy_ips',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            }
        }
    })
], ProxyIp);
exports.ProxyIpSchema = mongoose_1.SchemaFactory.createForClass(ProxyIp);
exports.ProxyIpSchema.index({ ipAddress: 1, port: 1 }, { unique: true });
exports.ProxyIpSchema.index({ status: 1, isAssigned: 1 });
exports.ProxyIpSchema.index({ assignedToClient: 1 });
exports.ProxyIpSchema.index({ source: 1 });
exports.ProxyIpSchema.index({ status: 1, lastUsed: 1 });
exports.ProxyIpSchema.index({ webshareId: 1 }, { sparse: true });
//# sourceMappingURL=proxy-ip.schema.js.map
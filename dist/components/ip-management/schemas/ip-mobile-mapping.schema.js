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
exports.IpMobileMappingSchema = exports.IpMobileMapping = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let IpMobileMapping = class IpMobileMapping {
};
exports.IpMobileMapping = IpMobileMapping;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Mobile number' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], IpMobileMapping.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '192.168.1.100:8080', description: 'IP address and port combination' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], IpMobileMapping.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID that owns this mobile number' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], IpMobileMapping.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Status of this mapping', enum: ['active', 'inactive'] }),
    (0, mongoose_1.Prop)({ required: true, default: 'active', enum: ['active', 'inactive'] }),
    __metadata("design:type", String)
], IpMobileMapping.prototype, "status", void 0);
exports.IpMobileMapping = IpMobileMapping = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'ip_mobile_mappings',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], IpMobileMapping);
exports.IpMobileMappingSchema = mongoose_1.SchemaFactory.createForClass(IpMobileMapping);
exports.IpMobileMappingSchema.index({ mobile: 1 }, { unique: true });
exports.IpMobileMappingSchema.index({ clientId: 1 });
exports.IpMobileMappingSchema.index({ ipAddress: 1 });
//# sourceMappingURL=ip-mobile-mapping.schema.js.map
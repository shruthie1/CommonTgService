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
exports.ReleaseIpFromMobileDto = exports.BulkAssignIpDto = exports.AssignIpToMobileDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AssignIpToMobileDto {
}
exports.AssignIpToMobileDto = AssignIpToMobileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Mobile number to assign IP to' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignIpToMobileDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID that owns this mobile number' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignIpToMobileDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '192.168.1.100:8080', description: 'Specific IP to assign (optional - if not provided, will auto-assign)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignIpToMobileDto.prototype, "preferredIp", void 0);
class BulkAssignIpDto {
}
exports.BulkAssignIpDto = BulkAssignIpDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['916265240911', '916265240912'], description: 'Array of mobile numbers to assign IPs to' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BulkAssignIpDto.prototype, "mobiles", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID that owns these mobile numbers' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkAssignIpDto.prototype, "clientId", void 0);
class ReleaseIpFromMobileDto {
}
exports.ReleaseIpFromMobileDto = ReleaseIpFromMobileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Mobile number to release IP from' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReleaseIpFromMobileDto.prototype, "mobile", void 0);
//# sourceMappingURL=assign-ip.dto.js.map
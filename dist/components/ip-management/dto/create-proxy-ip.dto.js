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
exports.CreateProxyIpDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateProxyIpDto {
}
exports.CreateProxyIpDto = CreateProxyIpDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '192.168.1.100', description: 'IP address of the proxy' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 8080, description: 'Port number of the proxy' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateProxyIpDto.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'http', description: 'Protocol type', enum: ['http', 'https', 'socks5'] }),
    (0, class_validator_1.IsEnum)(['http', 'https', 'socks5']),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "protocol", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'username', description: 'Username for proxy authentication', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'password', description: 'Password for proxy authentication', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Status of the proxy IP', enum: ['active', 'inactive'], required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['active', 'inactive']),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID that owns this IP', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProxyIpDto.prototype, "assignedToClient", void 0);
//# sourceMappingURL=create-proxy-ip.dto.js.map
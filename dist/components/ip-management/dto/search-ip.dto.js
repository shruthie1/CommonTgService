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
exports.SearchIpMobileMappingDto = exports.SearchProxyIpDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class SearchProxyIpDto {
}
exports.SearchProxyIpDto = SearchProxyIpDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '192.168.1.100', description: 'IP address to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 8080, description: 'Port number to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SearchProxyIpDto.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'http', description: 'Protocol type to search for', enum: ['http', 'https', 'socks5'], required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['http', 'https', 'socks5']),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "protocol", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'US', description: 'Country code to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "country", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Status to search for', enum: ['active', 'inactive', 'blocked', 'maintenance'], required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['active', 'inactive', 'blocked', 'maintenance']),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Whether to search for assigned or unassigned IPs', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SearchProxyIpDto.prototype, "isAssigned", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "assignedToClient", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'DataCenter', description: 'Provider to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchProxyIpDto.prototype, "provider", void 0);
class SearchIpMobileMappingDto {
}
exports.SearchIpMobileMappingDto = SearchIpMobileMappingDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '916265240911', description: 'Mobile number to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchIpMobileMappingDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '192.168.1.100:8080', description: 'IP address to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchIpMobileMappingDto.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'client1', description: 'Client ID to search for', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchIpMobileMappingDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', description: 'Status to search for', enum: ['active', 'inactive'], required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['active', 'inactive']),
    __metadata("design:type", String)
], SearchIpMobileMappingDto.prototype, "status", void 0);
//# sourceMappingURL=search-ip.dto.js.map
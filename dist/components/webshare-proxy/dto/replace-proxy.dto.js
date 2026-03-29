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
exports.ReplaceResultDto = exports.ReplaceProxyDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ReplaceProxyDto {
}
exports.ReplaceProxyDto = ReplaceProxyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the proxy to replace', example: '1.2.3.4' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReplaceProxyDto.prototype, "ipAddress", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Port of the proxy to replace', example: 8080 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ReplaceProxyDto.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Preferred country code for replacement', required: false, example: 'US' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReplaceProxyDto.prototype, "preferredCountry", void 0);
class ReplaceResultDto {
}
exports.ReplaceResultDto = ReplaceResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], ReplaceResultDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Replacement initiated' }),
    __metadata("design:type", String)
], ReplaceResultDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], ReplaceResultDto.prototype, "replacementId", void 0);
//# sourceMappingURL=replace-proxy.dto.js.map
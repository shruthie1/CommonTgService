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
exports.ExecuteRequestDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class ExecuteRequestDto {
}
exports.ExecuteRequestDto = ExecuteRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'The URL to send the request to' }),
    (0, class_validator_1.IsUrl)({}, { message: 'Please provide a valid URL' }),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' }),
    (0, class_validator_1.IsEnum)(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "method", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object, additionalProperties: { type: "string" } }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "headers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Request body data' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: Object, additionalProperties: { type: 'string' } }),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], ExecuteRequestDto.prototype, "params", void 0);
//# sourceMappingURL=execute-request.dto.js.map
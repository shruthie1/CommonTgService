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
exports.ExecuteRequestDto = exports.ResponseType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var ResponseType;
(function (ResponseType) {
    ResponseType["JSON"] = "json";
    ResponseType["TEXT"] = "text";
    ResponseType["BLOB"] = "blob";
    ResponseType["ARRAYBUFFER"] = "arraybuffer";
    ResponseType["STREAM"] = "stream";
})(ResponseType || (exports.ResponseType = ResponseType = {}));
class ExecuteRequestDto {
}
exports.ExecuteRequestDto = ExecuteRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'The URL to send the request to' }),
    (0, class_validator_1.IsUrl)({}, { message: 'Please provide a valid URL' }),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], default: 'GET' }),
    (0, class_validator_1.IsEnum)(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
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
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ResponseType, default: ResponseType.JSON }),
    (0, class_validator_1.IsEnum)(ResponseType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExecuteRequestDto.prototype, "responseType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Request timeout in milliseconds', default: 30000, minimum: 1000, maximum: 300000 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1000),
    (0, class_validator_1.Max)(300000),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], ExecuteRequestDto.prototype, "timeout", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Whether to follow redirects', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === 'true' || value === true),
    __metadata("design:type", Boolean)
], ExecuteRequestDto.prototype, "followRedirects", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Maximum number of redirects to follow', default: 5, minimum: 0, maximum: 10 }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], ExecuteRequestDto.prototype, "maxRedirects", void 0);
//# sourceMappingURL=execute-request.dto.js.map
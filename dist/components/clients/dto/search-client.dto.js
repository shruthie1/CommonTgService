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
exports.SearchClientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class SearchClientDto {
}
exports.SearchClientDto = SearchClientDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Client ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-z0-9_-]{3,50}$/i, { message: 'Invalid client ID format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "clientId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Database collection name' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "dbcoll", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Channel link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "channelLink", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "link", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Name of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Phone number of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "number", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Password of the client' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Repl link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "repl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Promotion Repl link of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "promoteRepl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Clientname of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Deployment key URL' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({}, { message: 'Invalid URL format' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "deployKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Main account of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "mainAccount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Product associated with the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "product", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Search by client ID that has promote mobiles assigned' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim().toLowerCase()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^(true|false)$/i, { message: 'hasPromoteMobiles must be either "true" or "false"' }),
    __metadata("design:type", String)
], SearchClientDto.prototype, "hasPromoteMobiles", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Paytm QR ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "qrId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Google Pay ID of the client' }),
    (0, class_transformer_1.Transform)(({ value }) => value?.trim()),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchClientDto.prototype, "gpayId", void 0);
//# sourceMappingURL=search-client.dto.js.map
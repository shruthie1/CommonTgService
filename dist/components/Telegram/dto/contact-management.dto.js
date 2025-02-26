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
exports.ContactImportDto = exports.ContactExportImportDto = exports.ContactBlockListDto = exports.ContactGroupDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class ContactGroupDto {
}
exports.ContactGroupDto = ContactGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name of the contact group' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactGroupDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User IDs to include in the group', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ContactGroupDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Optional description for the group' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ContactGroupDto.prototype, "description", void 0);
class ContactBlockListDto {
}
exports.ContactBlockListDto = ContactBlockListDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User IDs to block/unblock', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ContactBlockListDto.prototype, "userIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to block or unblock the users' }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ContactBlockListDto.prototype, "block", void 0);
class ContactExportImportDto {
    constructor() {
        this.includeBlocked = false;
    }
}
exports.ContactExportImportDto = ContactExportImportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['vcard', 'csv'], description: 'Export format type' }),
    (0, class_validator_1.IsEnum)(['vcard', 'csv']),
    __metadata("design:type", String)
], ContactExportImportDto.prototype, "format", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Whether to include blocked contacts', required: false, default: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Object)
], ContactExportImportDto.prototype, "includeBlocked", void 0);
class ContactImportDto {
}
exports.ContactImportDto = ContactImportDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Contacts to import', type: [Object] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], ContactImportDto.prototype, "contacts", void 0);
//# sourceMappingURL=contact-management.dto.js.map
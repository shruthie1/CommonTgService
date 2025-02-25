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
exports.AddContactsDto = exports.AddContactDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AddContactDto {
}
exports.AddContactDto = AddContactDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddContactDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Contact data', type: [Object] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], AddContactDto.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name prefix for contacts' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddContactDto.prototype, "prefix", void 0);
class AddContactsDto {
}
exports.AddContactsDto = AddContactsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddContactsDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Phone numbers to add', type: [String] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], AddContactsDto.prototype, "phoneNumbers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name prefix for contacts' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddContactsDto.prototype, "prefix", void 0);
//# sourceMappingURL=contact-operation.dto.js.map
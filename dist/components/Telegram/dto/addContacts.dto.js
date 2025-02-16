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
exports.AddContactsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AddContactsDto {
}
exports.AddContactsDto = AddContactsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The mobile number of the user for authentication',
        example: '+1234567890',
    }),
    __metadata("design:type", String)
], AddContactsDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'List of phone numbers to add as contacts',
        type: Object,
        example: [
            "919892184284", "919967837841", "919972600626",
        ],
    }),
    __metadata("design:type", Array)
], AddContactsDto.prototype, "phoneNumbers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Prefix for automated contact names',
        example: 'Contact',
    }),
    __metadata("design:type", String)
], AddContactsDto.prototype, "prefix", void 0);
//# sourceMappingURL=addContacts.dto.js.map
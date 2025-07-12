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
exports.GetDynamicDataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class GetDynamicDataDto {
}
exports.GetDynamicDataDto = GetDynamicDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Path to retrieve specific data using dot notation',
        example: 'profile.name',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-zA-Z0-9]+([\._][a-zA-Z0-9]+)*$/, {
        message: 'Invalid path format. Use dot notation (e.g., profile.name)',
    }),
    __metadata("design:type", String)
], GetDynamicDataDto.prototype, "path", void 0);
//# sourceMappingURL=get-dynamic-data.dto.js.map
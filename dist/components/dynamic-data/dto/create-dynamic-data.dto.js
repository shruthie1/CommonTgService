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
exports.CreateDynamicDataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateDynamicDataDto {
}
exports.CreateDynamicDataDto = CreateDynamicDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unique identifier for the dynamic data',
        example: 'user123',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateDynamicDataDto.prototype, "configKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Dynamic JSON data',
        example: {
            profile: {
                name: 'John Doe',
                age: 30,
            },
            preferences: {
                theme: 'dark',
                notifications: true,
            },
        },
    }),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Object)
], CreateDynamicDataDto.prototype, "data", void 0);
//# sourceMappingURL=create-dynamic-data.dto.js.map
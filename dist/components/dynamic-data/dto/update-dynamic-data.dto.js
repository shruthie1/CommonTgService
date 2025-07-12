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
exports.UpdateDynamicDataDto = exports.ArrayOperation = exports.ArrayOperationType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var ArrayOperationType;
(function (ArrayOperationType) {
    ArrayOperationType["PUSH"] = "PUSH";
    ArrayOperationType["POP"] = "POP";
    ArrayOperationType["INSERT"] = "INSERT";
    ArrayOperationType["REMOVE"] = "REMOVE";
    ArrayOperationType["UPDATE"] = "UPDATE";
})(ArrayOperationType || (exports.ArrayOperationType = ArrayOperationType = {}));
class ArrayOperation {
}
exports.ArrayOperation = ArrayOperation;
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ArrayOperationType,
        description: 'Type of array operation to perform',
    }),
    (0, class_validator_1.IsEnum)(ArrayOperationType),
    __metadata("design:type", String)
], ArrayOperation.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Index for array operations (required for INSERT and UPDATE)',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ArrayOperation.prototype, "index", void 0);
class UpdateDynamicDataDto {
}
exports.UpdateDynamicDataDto = UpdateDynamicDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Path to the field to update using dot notation. If not provided, updates entire data object.',
        example: 'profile.age',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[a-zA-Z0-9]+([\._][a-zA-Z0-9]+)*$/, {
        message: 'Invalid path format. Use dot notation (e.g., profile.age)',
    }),
    __metadata("design:type", String)
], UpdateDynamicDataDto.prototype, "path", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'New value for the field or entire data object if path is not provided',
        example: { profile: { age: 31 } },
    }),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Object)
], UpdateDynamicDataDto.prototype, "value", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Array operation configuration',
        required: false,
        type: ArrayOperation,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", ArrayOperation)
], UpdateDynamicDataDto.prototype, "arrayOperation", void 0);
//# sourceMappingURL=update-dynamic-data.dto.js.map
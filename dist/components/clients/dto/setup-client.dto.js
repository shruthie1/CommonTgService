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
exports.SetupClientQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const toBoolean = ({ value }) => value === 'true' || value === true;
class SetupClientQueryDto {
    constructor() {
        this.days = 0;
        this.archiveOld = true;
        this.formalities = true;
    }
}
exports.SetupClientQueryDto = SetupClientQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Days to push availability forward', default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SetupClientQueryDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Archive the old client back to buffer pool', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SetupClientQueryDto.prototype, "archiveOld", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Specific mobile to use as replacement' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SetupClientQueryDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Run privacy/cleanup formalities on old account', default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(toBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SetupClientQueryDto.prototype, "formalities", void 0);
//# sourceMappingURL=setup-client.dto.js.map
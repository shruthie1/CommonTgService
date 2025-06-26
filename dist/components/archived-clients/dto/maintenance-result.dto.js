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
exports.MaintenanceResultDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class MaintenanceResultDto {
}
exports.MaintenanceResultDto = MaintenanceResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 150,
        description: 'Total number of archived clients processed'
    }),
    __metadata("design:type", Number)
], MaintenanceResultDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 150,
        description: 'Number of clients successfully processed'
    }),
    __metadata("design:type", Number)
], MaintenanceResultDto.prototype, "processed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 23,
        description: 'Number of clients that had their sessions updated'
    }),
    __metadata("design:type", Number)
], MaintenanceResultDto.prototype, "updated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 5,
        description: 'Number of clients that were deleted due to inactive sessions'
    }),
    __metadata("design:type", Number)
], MaintenanceResultDto.prototype, "deleted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 2,
        description: 'Number of errors encountered during processing'
    }),
    __metadata("design:type", Number)
], MaintenanceResultDto.prototype, "errors", void 0);
//# sourceMappingURL=maintenance-result.dto.js.map
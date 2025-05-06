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
exports.DeleteHistoryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class DeleteHistoryDto {
    constructor() {
        this.justClear = true;
        this.revoke = false;
    }
}
exports.DeleteHistoryDto = DeleteHistoryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Username or peer ID of the chat whose history you want to delete',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteHistoryDto.prototype, "peer", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Deletes all messages with IDs less than or equal to this value',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "maxId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'If true, clears the history only for the current user without deleting for others',
        default: true,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeleteHistoryDto.prototype, "justClear", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'If true, deletes the message history for all participants (if permitted)',
        default: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeleteHistoryDto.prototype, "revoke", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum date (UNIX timestamp) for messages to be deleted',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "minDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum date (UNIX timestamp) for messages to be deleted',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeleteHistoryDto.prototype, "maxDate", void 0);
//# sourceMappingURL=delete-chat.dto.js.map
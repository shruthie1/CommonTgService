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
exports.ForwardBatchDto = exports.BatchProcessDto = exports.BatchItemDto = exports.BaseBatchItemDto = exports.BatchOperationType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
var BatchOperationType;
(function (BatchOperationType) {
    BatchOperationType["FORWARD"] = "forward";
    BatchOperationType["DELETE"] = "delete";
    BatchOperationType["EDIT"] = "edit";
})(BatchOperationType || (exports.BatchOperationType = BatchOperationType = {}));
class BaseBatchItemDto {
}
exports.BaseBatchItemDto = BaseBatchItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID for the operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BaseBatchItemDto.prototype, "chatId", void 0);
class BatchItemDto extends BaseBatchItemDto {
}
exports.BatchItemDto = BatchItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID for message operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchItemDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID for forward operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchItemDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID for forward operations', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchItemDto.prototype, "toChatId", void 0);
class BatchProcessDto {
    constructor() {
        this.batchSize = 20;
        this.delayMs = 1000;
    }
}
exports.BatchProcessDto = BatchProcessDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Operation type', enum: BatchOperationType }),
    (0, class_validator_1.IsEnum)(BatchOperationType),
    __metadata("design:type", String)
], BatchProcessDto.prototype, "operation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Items to process', type: [BatchItemDto] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], BatchProcessDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of items to process in each batch', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessDto.prototype, "batchSize", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Delay between batches in milliseconds', default: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessDto.prototype, "delayMs", void 0);
class ForwardBatchDto {
}
exports.ForwardBatchDto = ForwardBatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Source chat ID for forwarding' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardBatchDto.prototype, "fromChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Target chat ID for forwarding' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardBatchDto.prototype, "toChatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message IDs to forward', type: [Number] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1, { message: 'At least one message ID is required' }),
    (0, class_validator_1.ArrayMaxSize)(100, { message: 'Cannot forward more than 100 messages at once' }),
    (0, class_validator_1.IsNumber)({}, { each: true }),
    (0, class_transformer_1.Transform)(({ value }) => Array.isArray(value) ? value.map(Number) : value),
    __metadata("design:type", Array)
], ForwardBatchDto.prototype, "messageIds", void 0);
//# sourceMappingURL=batch-operations.dto.js.map
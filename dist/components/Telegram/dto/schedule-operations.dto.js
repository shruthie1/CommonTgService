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
exports.BatchProcessItemDto = exports.RescheduleMessageDto = exports.DeleteScheduledMessageDto = exports.GetScheduledMessagesDto = exports.ScheduleMessageDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class ScheduleMessageDto {
}
exports.ScheduleMessageDto = ScheduleMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to send message to' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScheduleMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message content' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScheduleMessageDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date to schedule the message' }),
    (0, class_validator_1.IsDateString)(),
    (0, class_transformer_1.Transform)(({ value }) => new Date(value)),
    __metadata("design:type", String)
], ScheduleMessageDto.prototype, "scheduledTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message to reply to', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ScheduleMessageDto.prototype, "replyTo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Silent notification', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ScheduleMessageDto.prototype, "silent", void 0);
class GetScheduledMessagesDto {
    constructor() {
        this.limit = 50;
    }
}
exports.GetScheduledMessagesDto = GetScheduledMessagesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to get scheduled messages from' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetScheduledMessagesDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Maximum number of messages to return', required: false, default: 50 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_transformer_1.Transform)(({ value }) => parseInt(value)),
    __metadata("design:type", Number)
], GetScheduledMessagesDto.prototype, "limit", void 0);
class DeleteScheduledMessageDto {
}
exports.DeleteScheduledMessageDto = DeleteScheduledMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID containing the scheduled message' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DeleteScheduledMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ID of the scheduled message to delete' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], DeleteScheduledMessageDto.prototype, "messageId", void 0);
class RescheduleMessageDto {
}
exports.RescheduleMessageDto = RescheduleMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID containing the message' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RescheduleMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID to reschedule' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RescheduleMessageDto.prototype, "messageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'New schedule date (ISO string)' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], RescheduleMessageDto.prototype, "newScheduleDate", void 0);
class BatchProcessItemDto {
}
exports.BatchProcessItemDto = BatchProcessItemDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID or message ID depending on operation' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BatchProcessItemDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID for operations that require it', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], BatchProcessItemDto.prototype, "messageId", void 0);
//# sourceMappingURL=schedule-operations.dto.js.map
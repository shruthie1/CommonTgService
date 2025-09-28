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
exports.CreateBotDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const bots_service_1 = require("../bots.service");
class CreateBotDto {
}
exports.CreateBotDto = CreateBotDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Telegram bot token',
        example: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBotDto.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Channel category the bot belongs to',
        enum: bots_service_1.ChannelCategory,
        example: bots_service_1.ChannelCategory.CLIENT_UPDATES
    }),
    (0, class_validator_1.IsEnum)(bots_service_1.ChannelCategory),
    __metadata("design:type", String)
], CreateBotDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Channel ID where bot will post messages',
        example: '-1001234567890'
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBotDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Optional description of the bot',
        required: false,
        example: 'Bot for sending client updates'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateBotDto.prototype, "description", void 0);
//# sourceMappingURL=create-bot.dto.js.map
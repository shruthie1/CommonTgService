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
exports.SearchChannelDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SearchChannelDto {
}
exports.SearchChannelDto = SearchChannelDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Unique identifier for the channel',
        example: '803387987',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Title of the channel',
        example: 'Earn money with Ayesha',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'privacy of the channel',
        example: false,
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "private", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Username of the channel',
        example: 'ayesha_channel',
    }),
    __metadata("design:type", String)
], SearchChannelDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Indicates if the channel can send messages',
        example: true,
    }),
    __metadata("design:type", Boolean)
], SearchChannelDto.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Minimum number of participants in the channel',
        example: 10,
    }),
    __metadata("design:type", Number)
], SearchChannelDto.prototype, "minParticipantsCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Maximum number of participants in the channel',
        example: 100,
    }),
    __metadata("design:type", Number)
], SearchChannelDto.prototype, "maxParticipantsCount", void 0);
//# sourceMappingURL=search-channel.dto.js.map
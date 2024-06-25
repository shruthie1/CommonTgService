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
exports.CreateChannelDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateChannelDto {
}
exports.CreateChannelDto = CreateChannelDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unique identifier for the channel',
        example: '803387987',
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is a broadcast channel',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "broadcast", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Indicates if the channel can send messages',
        example: true,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "canSendMsgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is a megagroup',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "megagroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Number of participants in the channel',
        example: 0,
    }),
    __metadata("design:type", Number)
], CreateChannelDto.prototype, "participantsCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel is restricted',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "restricted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Whether the channel can send messages',
        example: null,
        required: false,
    }),
    __metadata("design:type", Boolean)
], CreateChannelDto.prototype, "sendMessages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Title of the channel',
        example: 'Earn money with Ayesha',
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Username of the channel',
        example: null,
        required: false,
    }),
    __metadata("design:type", String)
], CreateChannelDto.prototype, "username", void 0);
//# sourceMappingURL=create-channel.dto.js.map
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
exports.CreateUserDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateUserDto {
    constructor() {
        this.twoFA = false;
        this.expired = false;
        this.password = null;
        this.movieCount = 0;
        this.photoCount = 0;
        this.videoCount = 0;
        this.otherPhotoCount = 0;
        this.otherVideoCount = 0;
        this.ownPhotoCount = 0;
        this.ownVideoCount = 0;
        this.contacts = 0;
        this.calls = {
            totalCalls: 0,
            outgoing: 0,
            incoming: 0,
            video: 0,
            audio: 0,
            chats: [],
        };
    }
}
exports.CreateUserDto = CreateUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number of the user', example: '917330803480' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Session information of the user', example: 'string' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'First name of the user', example: 'Praveen' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last name of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Username of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of channels', example: 56 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of personal chats', example: 74 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of messages', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of chats', example: 195 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Timestamp of last active', example: '2024-06-03' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram ID of the user', example: '2022068676' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'TwoFA status', example: false }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "twoFA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Expiration status', example: false }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "expired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'password', example: "pass" }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of movies', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "movieCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "photoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "videoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Gender of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of other photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of other videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of own photos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of own videos', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of contacts', example: 105 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "contacts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Per-chat call statistics',
        example: {
            totalCalls: 0,
            outgoing: 0,
            incoming: 0,
            video: 0,
            audio: 0,
            chats: [],
        },
    }),
    __metadata("design:type", Object)
], CreateUserDto.prototype, "calls", void 0);
//# sourceMappingURL=create-user.dto.js.map
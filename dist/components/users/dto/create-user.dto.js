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
exports.CreateUserDto = exports.UserCallsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class UserCallsDto {
    constructor() {
        this.totalCalls = 0;
        this.outgoing = 0;
        this.incoming = 0;
        this.video = 0;
        this.audio = 0;
    }
}
exports.UserCallsDto = UserCallsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total calls' }),
    __metadata("design:type", Number)
], UserCallsDto.prototype, "totalCalls", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Outgoing calls' }),
    __metadata("design:type", Number)
], UserCallsDto.prototype, "outgoing", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Incoming calls' }),
    __metadata("design:type", Number)
], UserCallsDto.prototype, "incoming", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Video calls' }),
    __metadata("design:type", Number)
], UserCallsDto.prototype, "video", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Audio calls' }),
    __metadata("design:type", Number)
], UserCallsDto.prototype, "audio", void 0);
class CreateUserDto {
    constructor() {
        this.twoFA = false;
        this.expired = false;
        this.password = null;
        this.channels = 0;
        this.personalChats = 0;
        this.totalChats = 0;
        this.contacts = 0;
        this.msgs = 0;
        this.photoCount = 0;
        this.videoCount = 0;
        this.movieCount = 0;
        this.ownPhotoCount = 0;
        this.otherPhotoCount = 0;
        this.ownVideoCount = 0;
        this.otherVideoCount = 0;
        this.lastActive = null;
        this.calls = new UserCallsDto();
    }
}
exports.CreateUserDto = CreateUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram session string' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "session", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'First name' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last name' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Telegram username' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram user ID' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Gender' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '2FA enabled' }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "twoFA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Account expired' }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "expired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '2FA password' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Channel count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Personal chat count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total chat count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Contact count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "contacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total photo count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "photoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total video count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "videoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Movie file count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "movieCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sent photo count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Received photo count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherPhotoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Sent video count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "ownVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Received video count' }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "otherVideoCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Last active timestamp' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Call statistics' }),
    __metadata("design:type", UserCallsDto)
], CreateUserDto.prototype, "calls", void 0);
//# sourceMappingURL=create-user.dto.js.map
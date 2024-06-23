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
    (0, swagger_1.ApiProperty)({ description: 'Last name of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Username of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "userName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of channels', example: 56 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "channels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of personal chats', example: 74 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "personalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Boolean flag indicating if demo was given', example: false }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Number of messages', example: 0 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "msgs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total number of chats', example: 195 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "totalChats", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Timestamp of last active', example: 1718260523 }),
    __metadata("design:type", Number)
], CreateUserDto.prototype, "lastActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Date of creation in YYYY-MM-DD format', example: '2024-06-03' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "date", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Telegram ID of the user', example: '2022068676' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "tgId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Timestamp of last update', example: '2024-06-13' }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'TwoFA status', example: 0 }),
    __metadata("design:type", Boolean)
], CreateUserDto.prototype, "twoFA", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'password', example: 0 }),
    __metadata("design:type", Boolean)
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
    (0, swagger_1.ApiProperty)({ description: 'Gender of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "gender", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Username of the user', example: null }),
    __metadata("design:type", String)
], CreateUserDto.prototype, "username", void 0);
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
    (0, swagger_1.ApiProperty)({
        description: 'Call details of the user',
        example: {
            outgoing: 1,
            incoming: 0,
            video: 1,
            chatCallCounts: [],
            totalCalls: 1,
        },
    }),
    __metadata("design:type", Object)
], CreateUserDto.prototype, "calls", void 0);
//# sourceMappingURL=create-user.dto.js.map
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
exports.CreateUserDataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateUserDataDto {
}
exports.CreateUserDataDto = CreateUserDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Total count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Picture count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "picCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last message timestamp' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "lastMsgTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Limit time' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "limitTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Paid count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "paidCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile count' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "prfCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Can reply' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "canReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pay amount' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'highestPayAmount' }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "highestPayAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'cheatCount', default: 0 }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "cheatCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'callTime', default: 0 }),
    __metadata("design:type", Number)
], CreateUserDataDto.prototype, "callTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Username' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Access hash' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "accessHash", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Paid reply status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Demo given status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Second show status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile name' }),
    __metadata("design:type", String)
], CreateUserDataDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pics Sent status' }),
    __metadata("design:type", Boolean)
], CreateUserDataDto.prototype, "picsSent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'videos' }),
    __metadata("design:type", Array)
], CreateUserDataDto.prototype, "videos", void 0);
//# sourceMappingURL=create-user-data.dto.js.map
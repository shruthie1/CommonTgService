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
exports.CreateStatDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateStatDto {
}
exports.CreateStatDto = CreateStatDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Count' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pay Amount' }),
    __metadata("design:type", Number)
], CreateStatDto.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Demo Given' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Demo Given Today' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'New User' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Paid Reply' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Second Show' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Did Pay' }),
    __metadata("design:type", Boolean)
], CreateStatDto.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile' }),
    __metadata("design:type", String)
], CreateStatDto.prototype, "profile", void 0);
//# sourceMappingURL=create-stat2.dto.js.map
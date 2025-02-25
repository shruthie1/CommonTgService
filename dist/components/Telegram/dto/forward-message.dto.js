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
exports.ForwardMessageDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class ForwardMessageDto {
}
exports.ForwardMessageDto = ForwardMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Mobile number' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardMessageDto.prototype, "mobile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID to forward to' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ForwardMessageDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Message ID to forward' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ForwardMessageDto.prototype, "messageId", void 0);
//# sourceMappingURL=forward-message.dto.js.map
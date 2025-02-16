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
exports.CreateTransactionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateTransactionDto {
}
exports.CreateTransactionDto = CreateTransactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique transaction ID (UTR).' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount involved in the transaction.' }),
    __metadata("design:type", Number)
], CreateTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Issue type reported by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Description of issue reported by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Refund method selected by the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User profile ID.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User chat ID.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the user.' }),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "ip", void 0);
//# sourceMappingURL=create-transaction.dto.js.map
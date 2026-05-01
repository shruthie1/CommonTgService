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
exports.StatSchema = exports.Stat = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let Stat = class Stat {
};
exports.Stat = Stat;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Chat ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Pay Amount' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Demo Given' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Demo Given Today' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'New User' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Paid Reply' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Second Show' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Did Pay' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Boolean)
], Stat.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Client' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Profile' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat.prototype, "profile", void 0);
exports.Stat = Stat = __decorate([
    (0, mongoose_1.Schema)()
], Stat);
exports.StatSchema = mongoose_1.SchemaFactory.createForClass(Stat);
exports.StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });
//# sourceMappingURL=stat.schema.js.map
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
exports.StatSchema = exports.Stat2 = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let Stat2 = class Stat2 {
};
exports.Stat2 = Stat2;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '6785668464', description: 'Chat ID' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat2.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: 'Pay Amount' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Stat2.prototype, "payAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "demoGiven", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Demo Given Today' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "demoGivenToday", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'New User' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "newUser", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Paid Reply' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "paidReply", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Amaan Khan', description: 'Name' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: 'Second Show' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Stat2.prototype, "secondShow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, description: 'Did Pay' }),
    (0, mongoose_1.Prop)({ required: false }),
    __metadata("design:type", Object)
], Stat2.prototype, "didPay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi', description: 'Profile' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Stat2.prototype, "profile", void 0);
exports.Stat2 = Stat2 = __decorate([
    (0, mongoose_1.Schema)()
], Stat2);
exports.StatSchema = mongoose_1.SchemaFactory.createForClass(Stat2);
exports.StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });
//# sourceMappingURL=stat2.schema.js.map
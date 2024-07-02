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
exports.PromoteStatSchema = exports.PromoteStat = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const swagger_1 = require("@nestjs/swagger");
let PromoteStat = class PromoteStat {
};
exports.PromoteStat = PromoteStat;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'shruthi1', description: 'Client ID' }),
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], PromoteStat.prototype, "client", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: { "Girls_Chating_Group_07": 4, "girls_friends_chatting_group_01": 14 }, description: 'Data' }),
    (0, mongoose_1.Prop)({ required: true, type: Map, of: Number }),
    __metadata("design:type", Map)
], PromoteStat.prototype, "data", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 552, description: 'Total Count' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "totalCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 314, description: 'Unique Channels' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "uniqueChannels", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719929752982.0, description: 'Release Day' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "releaseDay", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719860106247.0, description: 'Last Updated TimeStamp' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "lastupdatedTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'Is Active' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], PromoteStat.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1719929752982.0, description: 'Last Updated TimeStamp' }),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], PromoteStat.prototype, "lastUpdatedTimeStamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ["And_Girls_Boys_Group_Chatting", "Girls_Chating_Group_07"], description: 'Channels' }),
    (0, mongoose_1.Prop)({ required: true, type: [String] }),
    __metadata("design:type", Array)
], PromoteStat.prototype, "channels", void 0);
exports.PromoteStat = PromoteStat = __decorate([
    (0, mongoose_1.Schema)()
], PromoteStat);
exports.PromoteStatSchema = mongoose_1.SchemaFactory.createForClass(PromoteStat);
//# sourceMappingURL=promote-stat.schema.js.map
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
exports.BotSchema = exports.Bot = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const bots_service_1 = require("../bots.service");
const swagger_1 = require("@nestjs/swagger");
let Bot = class Bot {
};
exports.Bot = Bot;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Bot.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Bot.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: bots_service_1.ChannelCategory }),
    (0, mongoose_1.Prop)({ required: true, enum: bots_service_1.ChannelCategory }),
    __metadata("design:type", String)
], Bot.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Bot.prototype, "channelId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Bot.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Bot.prototype, "lastUsed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], Bot.prototype, "stats", void 0);
exports.Bot = Bot = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Bot);
exports.BotSchema = mongoose_1.SchemaFactory.createForClass(Bot);
//# sourceMappingURL=bot.schema.js.map
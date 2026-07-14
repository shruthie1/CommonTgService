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
exports.UserStatDailySchema = exports.UserStatDaily = exports.ReactionStatDailySchema = exports.ReactionStatDaily = exports.PromoteStatDailySchema = exports.PromoteStatDaily = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let PromoteStatDaily = class PromoteStatDaily {
};
exports.PromoteStatDaily = PromoteStatDaily;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], PromoteStatDaily.prototype, "date", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], PromoteStatDaily.prototype, "clientId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], PromoteStatDaily.prototype, "profile", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], PromoteStatDaily.prototype, "sent", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], PromoteStatDaily.prototype, "success", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], PromoteStatDaily.prototype, "failed", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], PromoteStatDaily.prototype, "banned", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], PromoteStatDaily.prototype, "expireAt", void 0);
exports.PromoteStatDaily = PromoteStatDaily = __decorate([
    (0, mongoose_1.Schema)({ collection: 'promoteStatsDaily', strict: false })
], PromoteStatDaily);
exports.PromoteStatDailySchema = mongoose_1.SchemaFactory.createForClass(PromoteStatDaily);
let ReactionStatDaily = class ReactionStatDaily {
};
exports.ReactionStatDaily = ReactionStatDaily;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], ReactionStatDaily.prototype, "date", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], ReactionStatDaily.prototype, "clientId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], ReactionStatDaily.prototype, "profile", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], ReactionStatDaily.prototype, "success", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], ReactionStatDaily.prototype, "failed", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], ReactionStatDaily.prototype, "restricted", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], ReactionStatDaily.prototype, "floods", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], ReactionStatDaily.prototype, "expireAt", void 0);
exports.ReactionStatDaily = ReactionStatDaily = __decorate([
    (0, mongoose_1.Schema)({ collection: 'reactionStatsDaily', strict: false })
], ReactionStatDaily);
exports.ReactionStatDailySchema = mongoose_1.SchemaFactory.createForClass(ReactionStatDaily);
let UserStatDaily = class UserStatDaily {
};
exports.UserStatDaily = UserStatDaily;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], UserStatDaily.prototype, "date", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], UserStatDaily.prototype, "clientId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], UserStatDaily.prototype, "profile", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], UserStatDaily.prototype, "newUsers", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], UserStatDaily.prototype, "active", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], UserStatDaily.prototype, "paid", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], UserStatDaily.prototype, "revenue", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], UserStatDaily.prototype, "expireAt", void 0);
exports.UserStatDaily = UserStatDaily = __decorate([
    (0, mongoose_1.Schema)({ collection: 'userStatsDaily', strict: false })
], UserStatDaily);
exports.UserStatDailySchema = mongoose_1.SchemaFactory.createForClass(UserStatDaily);
//# sourceMappingURL=daily-analytics.schema.js.map
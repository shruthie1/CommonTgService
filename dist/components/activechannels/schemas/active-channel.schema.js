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
exports.ActiveChannelSchema = exports.ActiveChannel = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const mongoose = require("mongoose");
let ActiveChannel = class ActiveChannel extends mongoose_2.Document {
    constructor() {
        super(...arguments);
        this.wordRestriction = 0;
        this.dMRestriction = 0;
        this.availableMsgs = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
        this.reactions = [
            '❤', '🔥', '👏', '🥰', '😁', '🤔',
            '🤯', '😱', '🤬', '😢', '🎉', '🤩',
            '🤮', '💩', '🙏', '👌', '🕊', '🤡',
            '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
            '🤣', '💔', '🏆', '😭', '😴', '👍',
            '🌚', '⚡', '🍌', '😐', '💋', '👻',
            '👀', '🙈', '🤝', '🤗', '🆒',
            '🗿', '🙉', '🙊', '🤷', '👎'
        ];
        this.banned = false;
        this.reactRestricted = false;
    }
};
exports.ActiveChannel = ActiveChannel;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "channelId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "broadcast", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "canSendMsgs", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "participantsCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "restricted", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "sendMessages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, default: null }),
    __metadata("design:type", String)
], ActiveChannel.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "wordRestriction", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose.Schema.Types.Number, default: 0 }),
    __metadata("design:type", Number)
], ActiveChannel.prototype, "dMRestriction", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"] }),
    __metadata("design:type", Array)
], ActiveChannel.prototype, "availableMsgs", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: [String], default: [
            '❤', '🔥', '👏', '🥰', '😁', '🤔',
            '🤯', '😱', '🤬', '😢', '🎉', '🤩',
            '🤮', '💩', '🙏', '👌', '🕊', '🤡',
            '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
            '🤣', '💔', '🏆', '😭', '😴', '👍',
            '🌚', '⚡', '🍌', '😐', '💋', '👻',
            '👀', '🙈', '🤝', '🤗', '🆒',
            '🗿', '🙉', '🙊', '🤷', '👎'
        ]
    }),
    __metadata("design:type", Array)
], ActiveChannel.prototype, "reactions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "banned", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "megagroup", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], ActiveChannel.prototype, "reactRestricted", void 0);
exports.ActiveChannel = ActiveChannel = __decorate([
    (0, mongoose_1.Schema)({ collection: 'activeChannels', versionKey: false, autoIndex: true })
], ActiveChannel);
exports.ActiveChannelSchema = mongoose_1.SchemaFactory.createForClass(ActiveChannel);
//# sourceMappingURL=active-channel.schema.js.map
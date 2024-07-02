"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteMsgSchema = exports.PromoteMsg = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let PromoteMsg = class PromoteMsg {
};
exports.PromoteMsg = PromoteMsg;
exports.PromoteMsg = PromoteMsg = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, autoIndex: true, strict: false, timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        }, })
], PromoteMsg);
exports.PromoteMsgSchema = mongoose_1.SchemaFactory.createForClass(PromoteMsg);
exports.PromoteMsgSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });
//# sourceMappingURL=promote-msgs.schema.js.map
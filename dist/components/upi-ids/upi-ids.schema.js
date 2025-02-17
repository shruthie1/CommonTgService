"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpiIdSchema = exports.UpiId = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = __importDefault(require("mongoose"));
let UpiId = class UpiId {
};
exports.UpiId = UpiId;
exports.UpiId = UpiId = __decorate([
    (0, mongoose_1.Schema)({
        versionKey: false,
        autoIndex: true,
        timestamps: false,
        toJSON: {
            virtuals: false,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], UpiId);
exports.UpiIdSchema = mongoose_1.SchemaFactory.createForClass(UpiId);
exports.UpiIdSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });
//# sourceMappingURL=upi-ids.schema.js.map
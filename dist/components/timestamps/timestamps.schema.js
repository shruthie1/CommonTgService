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
exports.TimestampSchema = exports.Timestamp = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = __importDefault(require("mongoose"));
let Timestamp = class Timestamp {
};
exports.Timestamp = Timestamp;
exports.Timestamp = Timestamp = __decorate([
    (0, mongoose_1.Schema)({
        versionKey: false,
        autoIndex: true,
        strict: false,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                delete ret._id;
            },
        },
    })
], Timestamp);
exports.TimestampSchema = mongoose_1.SchemaFactory.createForClass(Timestamp);
exports.TimestampSchema.add({ type: mongoose_2.default.Schema.Types.Mixed });
//# sourceMappingURL=timestamps.schema.js.map
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
exports.DynamicDataSchema = exports.DynamicData = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let DynamicData = class DynamicData {
};
exports.DynamicData = DynamicData;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, type: String }),
    __metadata("design:type", String)
], DynamicData.prototype, "configKey", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.Mixed, required: true }),
    __metadata("design:type", Object)
], DynamicData.prototype, "data", void 0);
exports.DynamicData = DynamicData = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'dynamic_data',
        versionKey: false,
        timestamps: true,
        strict: false,
        toJSON: {
            transform: (_, ret) => {
                delete ret._id;
                return ret;
            },
        },
    })
], DynamicData);
exports.DynamicDataSchema = mongoose_1.SchemaFactory.createForClass(DynamicData);
//# sourceMappingURL=dynamic-data.schema.js.map
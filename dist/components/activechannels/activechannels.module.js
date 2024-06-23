"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActiveChannelsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const activechannels_service_1 = require("./activechannels.service");
const activechannels_controller_1 = require("./activechannels.controller");
const active_channel_schema_1 = require("./schemas/active-channel.schema");
let ActiveChannelsModule = class ActiveChannelsModule {
};
exports.ActiveChannelsModule = ActiveChannelsModule;
exports.ActiveChannelsModule = ActiveChannelsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: active_channel_schema_1.ActiveChannel.name, schema: active_channel_schema_1.ActiveChannelSchema }]),
        ],
        controllers: [activechannels_controller_1.ActiveChannelsController],
        providers: [activechannels_service_1.ActiveChannelsService],
        exports: [activechannels_service_1.ActiveChannelsService]
    })
], ActiveChannelsModule);
//# sourceMappingURL=activechannels.module.js.map
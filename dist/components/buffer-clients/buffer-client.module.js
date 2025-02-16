"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferClientModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const buffer_client_service_1 = require("./buffer-client.service");
const buffer_client_controller_1 = require("./buffer-client.controller");
const buffer_client_schema_1 = require("./schemas/buffer-client.schema");
const Telegram_module_1 = require("../Telegram/Telegram.module");
const active_channels_module_1 = require("../active-channels/active-channels.module");
const users_module_1 = require("../users/users.module");
const client_module_1 = require("../clients/client.module");
const init_module_1 = require("../ConfigurationInit/init.module");
const channels_module_1 = require("../channels/channels.module");
const promote_client_module_1 = require("../promote-clients/promote-client.module");
let BufferClientModule = class BufferClientModule {
};
exports.BufferClientModule = BufferClientModule;
exports.BufferClientModule = BufferClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{ name: 'bufferClientModule', schema: buffer_client_schema_1.BufferClientSchema, collection: 'bufferClients' }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule),
            (0, common_1.forwardRef)(() => promote_client_module_1.PromoteClientModule)
        ],
        controllers: [buffer_client_controller_1.BufferClientController],
        providers: [buffer_client_service_1.BufferClientService],
        exports: [buffer_client_service_1.BufferClientService]
    })
], BufferClientModule);
//# sourceMappingURL=buffer-client.module.js.map
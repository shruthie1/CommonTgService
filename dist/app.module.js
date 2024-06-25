"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const users_module_1 = require("./components/users/users.module");
const user_data_module_1 = require("./components/user-data/user-data.module");
const client_module_1 = require("./components/clients/client.module");
const Telegram_module_1 = require("./components/Telegram/Telegram.module");
const buffer_client_module_1 = require("./components/buffer-clients/buffer-client.module");
const activechannels_module_1 = require("./components/activechannels/activechannels.module");
const archived_client_module_1 = require("./components/archived-clients/archived-client.module");
const init_module_1 = require("./components/ConfigurationInit/init.module");
const channels_module_1 = require("./components/channels/channels.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            Telegram_module_1.TelegramModule,
            activechannels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule
        ],
        exports: [
            Telegram_module_1.TelegramModule,
            activechannels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule
        ]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivedClientModule = exports.BufferClientModule = exports.UsersModule = exports.UserDataModule = exports.ClientModule = exports.ActiveChannelsModule = exports.TelegramModule = exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const users_module_1 = require("./components/users/users.module");
Object.defineProperty(exports, "UsersModule", { enumerable: true, get: function () { return users_module_1.UsersModule; } });
const user_data_module_1 = require("./components/user-data/user-data.module");
Object.defineProperty(exports, "UserDataModule", { enumerable: true, get: function () { return user_data_module_1.UserDataModule; } });
const client_module_1 = require("./components/clients/client.module");
Object.defineProperty(exports, "ClientModule", { enumerable: true, get: function () { return client_module_1.ClientModule; } });
const Telegram_module_1 = require("./components/Telegram/Telegram.module");
Object.defineProperty(exports, "TelegramModule", { enumerable: true, get: function () { return Telegram_module_1.TelegramModule; } });
const buffer_client_module_1 = require("./components/buffer-clients/buffer-client.module");
Object.defineProperty(exports, "BufferClientModule", { enumerable: true, get: function () { return buffer_client_module_1.BufferClientModule; } });
const activechannels_module_1 = require("./components/activechannels/activechannels.module");
Object.defineProperty(exports, "ActiveChannelsModule", { enumerable: true, get: function () { return activechannels_module_1.ActiveChannelsModule; } });
const archived_client_module_1 = require("./components/archived-clients/archived-client.module");
Object.defineProperty(exports, "ArchivedClientModule", { enumerable: true, get: function () { return archived_client_module_1.ArchivedClientModule; } });
const init_module_1 = require("./components/ConfigurationInit/init.module");
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
            archived_client_module_1.ArchivedClientModule
        ],
        exports: [
            Telegram_module_1.TelegramModule,
            activechannels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule
        ]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
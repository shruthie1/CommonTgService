"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramModule = void 0;
const common_1 = require("@nestjs/common");
const Telegram_controller_1 = require("./Telegram.controller");
const Telegram_service_1 = require("./Telegram.service");
const users_module_1 = require("../users/users.module");
const buffer_client_module_1 = require("../buffer-clients/buffer-client.module");
const active_channels_module_1 = require("../active-channels/active-channels.module");
const channels_module_1 = require("../channels/channels.module");
const telegram_logger_1 = require("./utils/telegram-logger");
const telegram_validation_config_1 = require("./config/telegram-validation.config");
const ConfigurationInit_1 = require("../ConfigurationInit");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ConfigurationInit_1.InitModule,
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            buffer_client_module_1.BufferClientModule,
            (0, common_1.forwardRef)(() => active_channels_module_1.ActiveChannelsModule),
            (0, common_1.forwardRef)(() => channels_module_1.ChannelsModule)
        ],
        controllers: [Telegram_controller_1.TelegramController],
        providers: [
            Telegram_service_1.TelegramService,
            telegram_validation_config_1.TelegramValidationConfig,
            {
                provide: 'TELEGRAM_LOGGER',
                useValue: telegram_logger_1.TelegramLogger.getInstance()
            }
        ],
        exports: [Telegram_service_1.TelegramService]
    })
], TelegramModule);
//# sourceMappingURL=Telegram.module.js.map
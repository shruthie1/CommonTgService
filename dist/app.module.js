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
const active_channels_module_1 = require("./components/active-channels/active-channels.module");
const archived_client_module_1 = require("./components/archived-clients/archived-client.module");
const init_module_1 = require("./components/ConfigurationInit/init.module");
const channels_module_1 = require("./components/channels/channels.module");
const app_controller_1 = require("./app.controller");
const logger_middleware_1 = require("./middlewares/logger.middleware");
const build_module_1 = require("./components/builds/build.module");
const upi_ids_module_1 = require("./components/upi-ids/upi-ids.module");
const promote_msgs_module_1 = require("./components/promote-msgs/promote-msgs.module");
const stat_module_1 = require("./components/stats/stat.module");
const stat2_module_1 = require("./components/stats2/stat2.module");
const promote_stat_module_1 = require("./components/promote-stats/promote-stat.module");
const promote_client_module_1 = require("./components/promote-clients/promote-client.module");
const TgSignup_module_1 = require("./components/TgSignup/TgSignup.module");
const transaction_module_1 = require("./components/transactions/transaction.module");
const npoint_module_1 = require("./components/n-point/npoint.module");
const timestamp_module_1 = require("./components/timestamps/timestamp.module");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(logger_middleware_1.LoggerMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            Telegram_module_1.TelegramModule,
            active_channels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule,
            promote_client_module_1.PromoteClientModule,
            build_module_1.BuildModule,
            upi_ids_module_1.UpiIdModule,
            promote_msgs_module_1.PromoteMsgModule,
            promote_stat_module_1.PromoteStatModule,
            stat_module_1.StatModule,
            stat2_module_1.Stat2Module,
            TgSignup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule,
            npoint_module_1.NpointModule,
            timestamp_module_1.TimestampModule,
        ],
        controllers: [app_controller_1.AppController],
        exports: [
            Telegram_module_1.TelegramModule,
            active_channels_module_1.ActiveChannelsModule,
            client_module_1.ClientModule,
            user_data_module_1.UserDataModule,
            users_module_1.UsersModule,
            buffer_client_module_1.BufferClientModule,
            archived_client_module_1.ArchivedClientModule,
            channels_module_1.ChannelsModule,
            promote_client_module_1.PromoteClientModule,
            TgSignup_module_1.TgSignupModule,
            transaction_module_1.TransactionModule,
            timestamp_module_1.TimestampModule
        ]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
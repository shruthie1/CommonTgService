"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const client_schema_1 = require("./schemas/client.schema");
const client_service_1 = require("./client.service");
const client_controller_1 = require("./client.controller");
const Telegram_module_1 = require("../Telegram/Telegram.module");
const buffer_client_module_1 = require("../buffer-clients/buffer-client.module");
const users_module_1 = require("../users/users.module");
const archived_client_module_1 = require("../archived-clients/archived-client.module");
const init_module_1 = require("../ConfigurationInit/init.module");
const npoint_module_1 = require("../n-point/npoint.module");
let ClientModule = class ClientModule {
};
exports.ClientModule = ClientModule;
exports.ClientModule = ClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{ name: client_schema_1.Client.name, schema: client_schema_1.ClientSchema }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => buffer_client_module_1.BufferClientModule),
            (0, common_1.forwardRef)(() => users_module_1.UsersModule),
            (0, common_1.forwardRef)(() => archived_client_module_1.ArchivedClientModule),
            npoint_module_1.NpointModule
        ],
        controllers: [client_controller_1.ClientController],
        providers: [client_service_1.ClientService],
        exports: [client_service_1.ClientService]
    })
], ClientModule);
//# sourceMappingURL=client.module.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivedClientModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const client_schema_1 = require("../clients/schemas/client.schema");
const Telegram_module_1 = require("../Telegram/Telegram.module");
const archived_client_service_1 = require("./archived-client.service");
const archived_client_controller_1 = require("./archived-client.controller");
const init_module_1 = require("../ConfigurationInit/init.module");
const client_module_1 = require("../clients/client.module");
let ArchivedClientModule = class ArchivedClientModule {
};
exports.ArchivedClientModule = ArchivedClientModule;
exports.ArchivedClientModule = ArchivedClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{ collection: 'ArchivedClients', name: 'ArchivedArchivedClientsModule', schema: client_schema_1.ClientSchema }]),
            (0, common_1.forwardRef)(() => Telegram_module_1.TelegramModule),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule)
        ],
        controllers: [archived_client_controller_1.ArchivedClientController],
        providers: [archived_client_service_1.ArchivedClientService],
        exports: [archived_client_service_1.ArchivedClientService]
    })
], ArchivedClientModule);
//# sourceMappingURL=archived-client.module.js.map
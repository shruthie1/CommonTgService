"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteStatModule = void 0;
const init_module_1 = require("./../ConfigurationInit/init.module");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const promote_stat_service_1 = require("./promote-stat.service");
const promote_stat_controller_1 = require("./promote-stat.controller");
const promote_stat_schema_1 = require("./schemas/promote-stat.schema");
const client_module_1 = require("../clients/client.module");
let PromoteStatModule = class PromoteStatModule {
};
exports.PromoteStatModule = PromoteStatModule;
exports.PromoteStatModule = PromoteStatModule = __decorate([
    (0, common_1.Module)({
        imports: [init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{ name: promote_stat_schema_1.PromoteStat.name, collection: "promoteStats", schema: promote_stat_schema_1.PromoteStatSchema }]),
            client_module_1.ClientModule
        ],
        controllers: [promote_stat_controller_1.PromoteStatController],
        providers: [promote_stat_service_1.PromoteStatService],
        exports: [promote_stat_service_1.PromoteStatService]
    })
], PromoteStatModule);
//# sourceMappingURL=promote-stat.module.js.map
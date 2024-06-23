"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const configuration_controller_1 = require("./configuration.controller");
const configuration_service_1 = require("./configuration.service");
const configuration_schema_1 = require("./configuration.schema");
const init_module_1 = require("../../init.module");
let ConfigurationModule = class ConfigurationModule {
};
exports.ConfigurationModule = ConfigurationModule;
exports.ConfigurationModule = ConfigurationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            init_module_1.initModule,
            mongoose_1.MongooseModule.forFeature([{
                    name: 'configurationModule', collection: 'configuration', schema: configuration_schema_1.ConfigurationSchema
                }])
        ],
        controllers: [configuration_controller_1.ConfigurationController],
        providers: [configuration_service_1.ConfigurationService],
    })
], ConfigurationModule);
//# sourceMappingURL=configuration.module.js.map
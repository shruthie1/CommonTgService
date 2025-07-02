"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpManagementModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const ip_management_controller_1 = require("./ip-management.controller");
const ip_management_service_1 = require("./ip-management.service");
const client_ip_integration_service_1 = require("./client-ip-integration.service");
const client_ip_integration_controller_1 = require("./client-ip-integration.controller");
const proxy_ip_schema_1 = require("./schemas/proxy-ip.schema");
const ip_mobile_mapping_schema_1 = require("./schemas/ip-mobile-mapping.schema");
const client_module_1 = require("../clients/client.module");
const promote_client_module_1 = require("../promote-clients/promote-client.module");
let IpManagementModule = class IpManagementModule {
};
exports.IpManagementModule = IpManagementModule;
exports.IpManagementModule = IpManagementModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: proxy_ip_schema_1.ProxyIp.name, schema: proxy_ip_schema_1.ProxyIpSchema },
                { name: ip_mobile_mapping_schema_1.IpMobileMapping.name, schema: ip_mobile_mapping_schema_1.IpMobileMappingSchema }
            ]),
            (0, common_1.forwardRef)(() => client_module_1.ClientModule),
            (0, common_1.forwardRef)(() => promote_client_module_1.PromoteClientModule)
        ],
        controllers: [ip_management_controller_1.IpManagementController, client_ip_integration_controller_1.ClientIpIntegrationController],
        providers: [ip_management_service_1.IpManagementService, client_ip_integration_service_1.ClientIpIntegrationService],
        exports: [ip_management_service_1.IpManagementService, client_ip_integration_service_1.ClientIpIntegrationService]
    })
], IpManagementModule);
//# sourceMappingURL=ip-management.module.js.map
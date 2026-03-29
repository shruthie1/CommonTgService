"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebshareProxyModule = void 0;
const common_1 = require("@nestjs/common");
const webshare_proxy_controller_1 = require("./webshare-proxy.controller");
const webshare_proxy_service_1 = require("./webshare-proxy.service");
const ip_management_module_1 = require("../ip-management/ip-management.module");
let WebshareProxyModule = class WebshareProxyModule {
};
exports.WebshareProxyModule = WebshareProxyModule;
exports.WebshareProxyModule = WebshareProxyModule = __decorate([
    (0, common_1.Module)({
        imports: [
            ip_management_module_1.IpManagementModule,
        ],
        controllers: [webshare_proxy_controller_1.WebshareProxyController],
        providers: [webshare_proxy_service_1.WebshareProxyService],
        exports: [webshare_proxy_service_1.WebshareProxyService],
    })
], WebshareProxyModule);
//# sourceMappingURL=webshare-proxy.module.js.map
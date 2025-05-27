"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientService = exports.ClientModule = exports.ClientController = void 0;
var client_controller_1 = require("./client.controller");
Object.defineProperty(exports, "ClientController", { enumerable: true, get: function () { return client_controller_1.ClientController; } });
var client_module_1 = require("./client.module");
Object.defineProperty(exports, "ClientModule", { enumerable: true, get: function () { return client_module_1.ClientModule; } });
var client_service_1 = require("./client.service");
Object.defineProperty(exports, "ClientService", { enumerable: true, get: function () { return client_service_1.ClientService; } });
__exportStar(require("./dto"), exports);
__exportStar(require("./schemas"), exports);
//# sourceMappingURL=index.js.map
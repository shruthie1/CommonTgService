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
exports.MemoryCleanerService = exports.AppController = exports.AppModule = void 0;
var app_module_1 = require("./app.module");
Object.defineProperty(exports, "AppModule", { enumerable: true, get: function () { return app_module_1.AppModule; } });
var app_controller_1 = require("./app.controller");
Object.defineProperty(exports, "AppController", { enumerable: true, get: function () { return app_controller_1.AppController; } });
var memory_cleanup_service_1 = require("./memory-cleanup.service");
Object.defineProperty(exports, "MemoryCleanerService", { enumerable: true, get: function () { return memory_cleanup_service_1.MemoryCleanerService; } });
__exportStar(require("./components"), exports);
__exportStar(require("./utils"), exports);
__exportStar(require("./middlewares"), exports);
__exportStar(require("./interfaces/telegram"), exports);
__exportStar(require("./IMap/IMap"), exports);
__exportStar(require("./features/clients"), exports);
__exportStar(require("./features/stats"), exports);
__exportStar(require("./features/telegram"), exports);
//# sourceMappingURL=index.js.map
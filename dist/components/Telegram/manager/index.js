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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramManager = exports.default = void 0;
var TelegramManager_1 = require("./TelegramManager");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(TelegramManager_1).default; } });
var TelegramManager_2 = require("./TelegramManager");
Object.defineProperty(exports, "TelegramManager", { enumerable: true, get: function () { return __importDefault(TelegramManager_2).default; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrottleMiddleware = void 0;
const common_1 = require("@nestjs/common");
const requestTimestamps = new Map();
let ThrottleMiddleware = class ThrottleMiddleware {
    use(req, res, next) {
        const key = `${req.method}:${req.url}`;
        const now = Date.now();
        const lastCall = requestTimestamps.get(key) || 0;
        const THROTTLE_TIME = 1000;
        if (now - lastCall < THROTTLE_TIME) {
            console.error(`Too many requests for ${key}. Please wait.`);
            return res.status(429).json({ message: 'Too many requests. Please wait.' });
        }
        requestTimestamps.set(key, now);
        next();
    }
};
exports.ThrottleMiddleware = ThrottleMiddleware;
exports.ThrottleMiddleware = ThrottleMiddleware = __decorate([
    (0, common_1.Injectable)()
], ThrottleMiddleware);
//# sourceMappingURL=throttle.middleware.js.map
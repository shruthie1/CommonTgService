"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudflareCacheInterceptor = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const decorators_1 = require("../decorators");
const decorators_2 = require("../decorators");
let CloudflareCacheInterceptor = class CloudflareCacheInterceptor {
    constructor(reflector) {
        this.reflector = reflector;
    }
    intercept(context, next) {
        const res = context.switchToHttp().getResponse();
        const noCache = this.reflector.get(decorators_2.NO_CACHE_KEY, context.getHandler());
        if (noCache) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return next.handle();
        }
        const cacheConfig = this.reflector.get(decorators_1.CLOUDFLARE_CACHE_KEY, context.getHandler());
        if (cacheConfig) {
            res.setHeader('Cache-Control', `public, max-age=${cacheConfig.browser}, s-maxage=${cacheConfig.edge}`);
        }
        return next.handle();
    }
};
exports.CloudflareCacheInterceptor = CloudflareCacheInterceptor;
exports.CloudflareCacheInterceptor = CloudflareCacheInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], CloudflareCacheInterceptor);
//# sourceMappingURL=cloudflare-cache.interceptor.js.map
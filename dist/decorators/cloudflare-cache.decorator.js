"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudflareCache = exports.CLOUDFLARE_CACHE_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.CLOUDFLARE_CACHE_KEY = 'cloudflare-cache-seconds';
const CloudflareCache = (edgeSeconds, browserSeconds = 0) => (0, common_1.SetMetadata)(exports.CLOUDFLARE_CACHE_KEY, {
    edge: edgeSeconds,
    browser: browserSeconds,
});
exports.CloudflareCache = CloudflareCache;
//# sourceMappingURL=cloudflare-cache.decorator.js.map
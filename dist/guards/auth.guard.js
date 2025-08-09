"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AuthGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const utils_1 = require("../utils");
const logbots_1 = require("../utils/logbots");
const ALLOWED_IPS = ['31.97.59.2', '148.230.84.50', '13.228.225.19', '18.142.128.26', '54.254.162.138'];
const ALLOWED_ORIGINS = [
    'https://paidgirl.site',
    'https://zomcall.netlify.app',
    'https://tgchats.netlify.app',
    'https://tg-chats.netlify.app',
    'https://report-upi.netlify.app'
].map(origin => origin.toLowerCase());
const IGNORE_PATHS = [
    '/',
    '/favicon.ico',
    /^\/favicon\//i,
    /^\/blockuserall\//i,
    /^\/sendtoall\//i,
    /^\/sendtochannel($|\/)/i,
    '/apim',
    '/health',
    /^\/public($|\/)/i,
];
let AuthGuard = AuthGuard_1 = class AuthGuard {
    constructor() {
        this.logger = new common_1.Logger(AuthGuard_1.name);
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const path = request.path;
        const url = request.url;
        const originalUrl = request.originalUrl;
        const apiKey = request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();
        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);
        if (this.isIgnoredPath(path, url, originalUrl)) {
            return true;
        }
        this.logger.debug(`Request Received: ${originalUrl}`);
        let passedReason = null;
        if (apiKey && apiKey.toLowerCase() === "santoor") {
            passedReason = 'API key valid';
        }
        else {
            this.logger.debug(`❌ API Key mismatch`);
        }
        if (!passedReason && ALLOWED_IPS.includes(clientIp)) {
            passedReason = 'IP allowed';
        }
        else if (!passedReason) {
            this.logger.debug(`❌ IP not allowed`);
        }
        if (!passedReason && origin && this.isOriginAllowed(origin)) {
            passedReason = 'Origin allowed';
        }
        else if (!passedReason) {
            this.logger.debug(`❌ Origin not allowed`);
        }
        if (passedReason) {
            return true;
        }
        this.logger.warn(`❌ Access denied — no condition satisfied`);
        (0, utils_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId || process.env.serviceName} Failed :: Unauthorized access attempt from ${clientIp || 'unknown IP'} with origin ${origin || 'unknown origin'} for ${originalUrl}`)}`);
        throw new common_1.UnauthorizedException('Access denied: No valid API key, IP, or Origin');
    }
    isIgnoredPath(path, url, originalUrl) {
        const urlsToTest = [path, url, originalUrl].filter(Boolean);
        for (const urlToTest of urlsToTest) {
            for (const ignore of IGNORE_PATHS) {
                if (typeof ignore === 'string') {
                    if (ignore.toLowerCase() === urlToTest.toLowerCase()) {
                        return true;
                    }
                }
                else {
                    if (ignore.test(urlToTest)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    isOriginAllowed(origin) {
        if (!origin)
            return false;
        const normalizedOrigin = origin.toLowerCase().trim();
        return ALLOWED_ORIGINS.includes(normalizedOrigin);
    }
    getHeaderValue(request, headerName) {
        return request.headers[headerName.toLowerCase()];
    }
    extractRealClientIP(request) {
        const cfConnectingIP = this.getHeaderValue(request, 'cf-connecting-ip');
        if (cfConnectingIP) {
            return cfConnectingIP;
        }
        const xRealIP = this.getHeaderValue(request, 'x-real-ip');
        if (xRealIP) {
            return xRealIP;
        }
        const xForwardedFor = this.getHeaderValue(request, 'x-forwarded-for');
        if (xForwardedFor) {
            const firstIP = xForwardedFor.split(',')[0].trim();
            return firstIP;
        }
        const expressIP = request.ip;
        if (expressIP) {
            const cleanIP = expressIP.replace('::ffff:', '');
            return cleanIP;
        }
        const connectionIP = request.connection?.remoteAddress;
        if (connectionIP) {
            const cleanIP = connectionIP.replace('::ffff:', '');
            return cleanIP;
        }
        this.logger.warn(`Unable to extract client IP, using fallback`);
        return 'unknown';
    }
    extractRealOrigin(request) {
        const origin = this.getHeaderValue(request, 'origin');
        if (origin) {
            return origin;
        }
        const xOriginalHost = this.getHeaderValue(request, 'x-original-host');
        if (xOriginalHost) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xOriginalHost}`;
            return constructedOrigin;
        }
        const xForwardedHost = this.getHeaderValue(request, 'x-forwarded-host');
        if (xForwardedHost) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xForwardedHost}`;
            return constructedOrigin;
        }
        const host = this.getHeaderValue(request, 'host');
        if (host) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${host}`;
            return constructedOrigin;
        }
        const referer = this.getHeaderValue(request, 'referer');
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
                return refererOrigin;
            }
            catch (error) {
                this.logger.debug(`Failed to parse referer as URL: ${referer}`);
            }
        }
        this.logger.debug(`Unable to extract origin from any header`);
        return undefined;
    }
    extractProtocol(request) {
        const xForwardedProto = this.getHeaderValue(request, 'x-forwarded-proto');
        if (xForwardedProto) {
            return xForwardedProto.toLowerCase();
        }
        const cfVisitor = this.getHeaderValue(request, 'cf-visitor');
        if (cfVisitor) {
            try {
                const visitor = JSON.parse(cfVisitor);
                if (visitor.scheme) {
                    return visitor.scheme.toLowerCase();
                }
            }
            catch (error) {
                this.logger.debug(`Failed to parse CF-Visitor: ${cfVisitor}`);
            }
        }
        if (request.secure) {
            return 'https';
        }
        const xForwardedSsl = this.getHeaderValue(request, 'x-forwarded-ssl');
        if (xForwardedSsl && xForwardedSsl.toLowerCase() === 'on') {
            return 'https';
        }
        if (process.env.NODE_ENV === 'production') {
            return 'https';
        }
        return 'http';
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = AuthGuard_1 = __decorate([
    (0, common_1.Injectable)()
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map
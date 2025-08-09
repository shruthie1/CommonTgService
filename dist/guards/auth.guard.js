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
    'https://ums-test.paidgirl.site',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5002',
].map(origin => origin.toLowerCase());
const IGNORE_PATHS = [
    '/',
    '/apim',
    '/health',
    /^\/public\//,
];
let AuthGuard = AuthGuard_1 = class AuthGuard {
    constructor() {
        this.logger = new common_1.Logger(AuthGuard_1.name);
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const path = request.path;
        const apiKey = request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();
        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);
        if (this.isIgnoredPath(path)) {
            return true;
        }
        this.logger.debug(`Incoming request:`);
        this.logger.debug(`→ API Key: ${apiKey || 'NONE'}`);
        this.logger.debug(`→ Client IP: ${clientIp}`);
        this.logger.debug(`→ Origin: ${origin || 'NONE'}`);
        let passedReason = null;
        if (apiKey && apiKey.toLowerCase() === "santoor") {
            this.logger.debug(`✅ API Key matched`);
            passedReason = 'API key valid';
        }
        else {
            this.logger.debug(`❌ API Key mismatch`);
        }
        if (!passedReason && ALLOWED_IPS.includes(clientIp)) {
            this.logger.debug(`✅ IP allowed`);
            passedReason = 'IP allowed';
        }
        else if (!passedReason) {
            this.logger.debug(`❌ IP not allowed`);
        }
        if (!passedReason && origin && this.isOriginAllowed(origin)) {
            this.logger.debug(`✅ Origin allowed`);
            passedReason = 'Origin allowed';
        }
        else if (!passedReason) {
            this.logger.debug(`❌ Origin not allowed`);
        }
        if (passedReason) {
            this.logger.debug(`Access granted because: ${passedReason}`);
            return true;
        }
        this.logger.warn(`❌ Access denied — no condition satisfied`);
        (0, utils_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId || process.env.serviceName} Failed :: Unauthorized access attempt from ${clientIp || 'unknown IP'} with origin ${origin || 'unknown origin'} for ${request.originalUrl}`)}`);
        throw new common_1.UnauthorizedException('Access denied: No valid API key, IP, or Origin');
    }
    isIgnoredPath(path) {
        return IGNORE_PATHS.some(ignore => typeof ignore === 'string' ? ignore === path : ignore.test(path));
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
            this.logger.debug(`Using CF-Connecting-IP: ${cfConnectingIP}`);
            return cfConnectingIP;
        }
        const xRealIP = this.getHeaderValue(request, 'x-real-ip');
        if (xRealIP) {
            this.logger.debug(`Using X-Real-IP: ${xRealIP}`);
            return xRealIP;
        }
        const xForwardedFor = this.getHeaderValue(request, 'x-forwarded-for');
        if (xForwardedFor) {
            const firstIP = xForwardedFor.split(',')[0].trim();
            this.logger.debug(`Using X-Forwarded-For (first): ${firstIP}`);
            return firstIP;
        }
        const expressIP = request.ip;
        if (expressIP) {
            const cleanIP = expressIP.replace('::ffff:', '');
            this.logger.debug(`Using Express IP: ${cleanIP}`);
            return cleanIP;
        }
        const connectionIP = request.connection?.remoteAddress;
        if (connectionIP) {
            const cleanIP = connectionIP.replace('::ffff:', '');
            this.logger.debug(`Using connection remoteAddress: ${cleanIP}`);
            return cleanIP;
        }
        this.logger.warn(`Unable to extract client IP, using fallback`);
        return 'unknown';
    }
    extractRealOrigin(request) {
        const origin = this.getHeaderValue(request, 'origin');
        if (origin) {
            this.logger.debug(`Using Origin header: ${origin}`);
            return origin;
        }
        const xOriginalHost = this.getHeaderValue(request, 'x-original-host');
        if (xOriginalHost) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xOriginalHost}`;
            this.logger.debug(`Using X-Original-Host to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }
        const xForwardedHost = this.getHeaderValue(request, 'x-forwarded-host');
        if (xForwardedHost) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xForwardedHost}`;
            this.logger.debug(`Using X-Forwarded-Host to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }
        const host = this.getHeaderValue(request, 'host');
        if (host) {
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${host}`;
            this.logger.debug(`Using Host header to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }
        const referer = this.getHeaderValue(request, 'referer');
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
                this.logger.debug(`Using Referer to extract origin: ${refererOrigin}`);
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
            this.logger.debug(`Using X-Forwarded-Proto: ${xForwardedProto}`);
            return xForwardedProto.toLowerCase();
        }
        const cfVisitor = this.getHeaderValue(request, 'cf-visitor');
        if (cfVisitor) {
            try {
                const visitor = JSON.parse(cfVisitor);
                if (visitor.scheme) {
                    this.logger.debug(`Using CF-Visitor scheme: ${visitor.scheme}`);
                    return visitor.scheme.toLowerCase();
                }
            }
            catch (error) {
                this.logger.debug(`Failed to parse CF-Visitor: ${cfVisitor}`);
            }
        }
        if (request.secure) {
            this.logger.debug(`Using request.secure: https`);
            return 'https';
        }
        const xForwardedSsl = this.getHeaderValue(request, 'x-forwarded-ssl');
        if (xForwardedSsl && xForwardedSsl.toLowerCase() === 'on') {
            this.logger.debug(`Using X-Forwarded-SSL: https`);
            return 'https';
        }
        if (process.env.NODE_ENV === 'production') {
            this.logger.debug(`Production environment, defaulting to https`);
            return 'https';
        }
        this.logger.debug(`Development environment, defaulting to http`);
        return 'http';
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = AuthGuard_1 = __decorate([
    (0, common_1.Injectable)()
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map
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
const ALLOWED_ORIGINS = ['https://paidgirl.site', 'https://zomcall.netlify.app'];
let AuthGuard = AuthGuard_1 = class AuthGuard {
    constructor() {
        this.logger = new common_1.Logger(AuthGuard_1.name);
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();
        const clientIp = (request.ip || request.connection.remoteAddress)?.replace('::ffff:', '');
        const origin = request.headers.origin;
        this.logger.debug(`Incoming request:`);
        this.logger.debug(`→ API Key: ${apiKey || 'NONE'}`);
        this.logger.debug(`→ Client IP: ${clientIp}`);
        this.logger.debug(`→ Origin: ${origin || 'NONE'}`);
        let passedReason = null;
        if (apiKey && apiKey === "santoor") {
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
        if (!passedReason && origin && ALLOWED_ORIGINS.includes(origin)) {
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
        (0, utils_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId ? process.env.clientId : process.env.serviceName} Failed :: Unauthorized access attempt from ${clientIp || 'unknown IP'} with origin ${origin || 'unknown origin'} for ${request.originalUrl}`)}`);
        throw new common_1.UnauthorizedException('Access denied: No valid API key, IP, or Origin');
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = AuthGuard_1 = __decorate([
    (0, common_1.Injectable)()
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map
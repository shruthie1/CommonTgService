import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { fetchWithTimeout } from '../utils';
import { notifbot } from '../utils/logbots';

const ALLOWED_IPS = ['31.97.59.2', '148.230.84.50', '13.228.225.19', '18.142.128.26', '54.254.162.138'];
const ALLOWED_ORIGINS = ['https://paidgirl.site', 'https://zomcall.netlify.app'];

// ✅ Ignore list (exact paths or regex)
const IGNORE_PATHS: (string | RegExp)[] = [
    '/',
    '/apim',
    '/health',
    /^\/public\//,  // any path starting with /public/
];

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        const path = request.path;
        const apiKey =
            request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();
        const clientIp = (request.ip || request.connection.remoteAddress)?.replace('::ffff:', '');
        const origin = request.headers.origin;

        // ✅ Skip if path is in ignore list
        if (this.isIgnoredPath(path)) {
            return true;
        }

        this.logger.debug(`Incoming request:`);
        this.logger.debug(`→ API Key: ${apiKey || 'NONE'}`);
        this.logger.debug(`→ Client IP: ${clientIp}`);
        this.logger.debug(`→ Origin: ${origin || 'NONE'}`);

        let passedReason: string | null = null;

        // Check API Key
        if (apiKey && apiKey === "santoor") {
            this.logger.debug(`✅ API Key matched`);
            passedReason = 'API key valid';
        } else {
            this.logger.debug(`❌ API Key mismatch`);
        }

        // Check IP
        if (!passedReason && ALLOWED_IPS.includes(clientIp)) {
            this.logger.debug(`✅ IP allowed`);
            passedReason = 'IP allowed';
        } else if (!passedReason) {
            this.logger.debug(`❌ IP not allowed`);
        }

        // Check Origin
        if (!passedReason && origin && ALLOWED_ORIGINS.includes(origin)) {
            this.logger.debug(`✅ Origin allowed`);
            passedReason = 'Origin allowed';
        } else if (!passedReason) {
            this.logger.debug(`❌ Origin not allowed`);
        }

        if (passedReason) {
            this.logger.debug(`Access granted because: ${passedReason}`);
            return true;
        }

        this.logger.warn(`❌ Access denied — no condition satisfied`);
        fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(
            `${process.env.clientId || process.env.serviceName} Failed :: Unauthorized access attempt from ${clientIp || 'unknown IP'} with origin ${origin || 'unknown origin'} for ${request.originalUrl}`
        )}`);
        throw new UnauthorizedException('Access denied: No valid API key, IP, or Origin');
    }

    private isIgnoredPath(path: string): boolean {
        return IGNORE_PATHS.some(ignore =>
            typeof ignore === 'string' ? ignore === path : ignore.test(path)
        );
    }
}

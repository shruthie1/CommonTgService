import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { BotConfig, ChannelCategory } from '../utils/TelegramBots.config';

const ALLOWED_IPS = [
    '31.97.59.2',
    '148.230.84.50',
    '13.228.225.19',
    '18.142.128.26',
    '54.254.162.138',
];

const ALLOWED_ORIGINS = [
    'https://paidgirl.site',
    'https://zomcall.netlify.app',
    'https://tgchats.netlify.app',
    'https://tg-chats.netlify.app',
    'https://report-upi.netlify.app',
].map((origin) => origin.toLowerCase());

/**
 * Ignored paths are evaluated in priority order:
 * 1. Exact paths first (fast)
 * 2. Regex patterns for broader matches
 */
const IGNORE_PATHS: (string | RegExp)[] = [
    '/',
    '/exit',
    '/getProcessId',
    '/executehs',
    '/executehsl',
    '/sendmessage',
    '/asktopay',
    '/refreshmap',
    '/markasread',
    '/checktghealth',
    '/isRecentUser',
    '/paymentstats',
    '/sendtochannel',
    '/joinchannel',
    '/leavechannel',
    '/channelinfo',
    '/getme',
    '/trytoconnect',
    '/chat',
    '/favicon.ico',
    /^\/userdata(?:$|\/)/i,
    /^\/favicon(?:$|\/)/i,
    /^\/favicon.ico(?:$|\/)/i,
    /^\/blockuserall(?:$|\/)/i,
    /^\/sendtoall(?:$|\/)/i,
    /^\/sendtochannel(?:$|\/)/i,
    '/apim',
    '/health',
    /^\/public(?:$|\/)/i,
];

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        const path = request.path;
        const url = request.url;
        const originalUrl = request.originalUrl;

        // ✅ Step 1: Skip ignored paths early
        if (this.isIgnoredPath(path, url, originalUrl)) {
            return true;
        }

        const apiKey =
            request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();

        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);

        this.logger.debug(`Request Received: ${originalUrl}`);
        // this.logger.debug(`→ Client IP: ${clientIp}`);
        // this.logger.debug(`→ Origin: ${origin || 'NONE'}`);

        let passedReason: string | null = null;

        // ✅ Step 2: Priority check — API Key → IP → Origin
        if (apiKey && apiKey.toLowerCase() === 'santoor') {
            passedReason = 'API key valid';
        } else if (ALLOWED_IPS.includes(clientIp)) {
            passedReason = 'IP allowed';
        } else if (origin && this.isOriginAllowed(origin)) {
            passedReason = 'Origin allowed';
        }

        // ✅ Step 3: Final decision
        if (passedReason) {
            // this.logger.debug(`✅ Access granted because: ${passedReason}`);
            return true;
        }

        this.logger.warn(`❌ Access denied — no condition satisfied`);
        this.notifyUnauthorized(clientIp, origin, originalUrl);
        throw new UnauthorizedException(
            'Access denied',
        );
    }

    private isIgnoredPath(...urls: string[]): boolean {
        for (const urlToTest of urls.filter(Boolean)) {
            for (const ignore of IGNORE_PATHS) {
                if (typeof ignore === 'string') {
                    if (ignore.toLowerCase() === urlToTest.toLowerCase()) {
                        return true;
                    }
                } else if (ignore.test(urlToTest)) {
                    return true;
                }
            }
        }
        return false;
    }

    private isOriginAllowed(origin: string): boolean {
        try {
            const { protocol, host } = new URL(origin.toLowerCase().trim());
            const normalized = `${protocol}//${host}`;
            return ALLOWED_ORIGINS.includes(normalized);
        } catch {
            return false;
        }
    }

    private getHeaderValue(
        request: Request,
        headerName: string,
    ): string | undefined {
        return request.headers[headerName.toLowerCase()] as string;
    }

    private extractRealClientIP(request: Request): string {
        // Cloudflare first
        const cfConnectingIP = this.getHeaderValue(request, 'cf-connecting-ip');
        if (cfConnectingIP) return cfConnectingIP;

        // Nginx-provided IPs
        const xRealIP = this.getHeaderValue(request, 'x-real-ip');
        if (xRealIP) return xRealIP;

        const xForwardedFor = this.getHeaderValue(request, 'x-forwarded-for');
        if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

        // Express defaults
        if (request.ip) return request.ip.replace('::ffff:', '');
        if (request.connection?.remoteAddress)
            return request.connection.remoteAddress.replace('::ffff:', '');

        this.logger.warn(`Unable to extract client IP`);
        return 'unknown';
    }

    private extractRealOrigin(request: Request): string | undefined {
        const origin = this.getHeaderValue(request, 'origin');
        if (origin) return origin;

        const xOriginalHost = this.getHeaderValue(request, 'x-original-host');
        if (xOriginalHost)
            return `${this.extractProtocol(request)}://${xOriginalHost}`;

        const xForwardedHost = this.getHeaderValue(request, 'x-forwarded-host');
        if (xForwardedHost)
            return `${this.extractProtocol(request)}://${xForwardedHost}`;

        const host = this.getHeaderValue(request, 'host');
        if (host) return `${this.extractProtocol(request)}://${host}`;

        const referer = this.getHeaderValue(request, 'referer');
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                return `${refererUrl.protocol}//${refererUrl.host}`;
            } catch {
                this.logger.debug(`Invalid referer: ${referer}`);
            }
        }

        return undefined;
    }

    private extractProtocol(request: Request): string {
        const xForwardedProto = this.getHeaderValue(request, 'x-forwarded-proto');
        if (xForwardedProto) return xForwardedProto.toLowerCase();

        const cfVisitor = this.getHeaderValue(request, 'cf-visitor');
        if (cfVisitor) {
            try {
                const visitor = JSON.parse(cfVisitor);
                if (visitor.scheme) return visitor.scheme.toLowerCase();
            } catch {
                this.logger.debug(`Failed to parse CF-Visitor`);
            }
        }

        if (request.secure) return 'https';
        const xForwardedSsl = this.getHeaderValue(request, 'x-forwarded-ssl');
        if (xForwardedSsl?.toLowerCase() === 'on') return 'https';

        return process.env.NODE_ENV === 'production' ? 'https' : 'http';
    }

    private notifyUnauthorized(
        clientIp: string,
        origin: string | undefined,
        originalUrl: string,
    ) {
        try {
            BotConfig.getInstance().sendMessage(
                ChannelCategory.UNAUTH_CALLS,
                `Unauthorized Attempt\nip: ${clientIp || 'unknown IP'}\norigin: ${origin || 'unknown origin'}\npath: ${originalUrl || 'unknown path'}`,
            );

        } catch (err) {
            this.logger.error(`Notifbot failed: ${err.message}`);
        }
    }
}

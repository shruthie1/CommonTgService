import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException
} from '@nestjs/common';
import { Request } from 'express';
import { getBotsServiceInstance, Logger } from '../utils';
import { ChannelCategory } from '../components';

const ALLOWED_IPS = [
    '31.97.59.2',
    '148.230.84.50',
    '13.228.225.19',
    '18.142.128.26',
    '54.254.162.138',
];

const ALLOWED_ORIGINS = [
    'https://paidgirls.site',
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
    '/builds',
    '/favicon.ico',
    /^\/userdata(?:$|\/)/i,
    /^\/favicon(?:$|\/)/i,
    /^\/favicon.ico(?:$|\/)/i,
    /^\/blockuserall(?:$|\/)/i,
    /^\/sendtoall(?:$|\/)/i,
    /^\/sendtochannel(?:$|\/)/i,
    /^\/apim(?:$|\/)/i,
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
        const safeOriginalUrl = this.redactQuerySecret(originalUrl || url || path);
        const queryApiKey =
            request.query['apiKey']?.toString() ||
            request.query['apikey']?.toString() ||
            request.query['api_key']?.toString();

        // ✅ Step 1: Skip ignored paths early.
        // Some ignored paths (e.g. /builds) are only meant to be PUBLIC for safe reads — the
        // ignore match is path-only and would otherwise also exempt mutating verbs (PATCH/POST),
        // letting an unauthenticated caller overwrite build/deploy config. Only honor the bypass
        // for GET/HEAD/OPTIONS on those write-protected paths.
        const method = (request.method || 'GET').toUpperCase();
        const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const ignoredPathIsWriteProtected = this.isWriteProtectedIgnorePath(path, url, originalUrl);
        if (this.isIgnoredPath(path, url, originalUrl) && (isSafeMethod || !ignoredPathIsWriteProtected)) {
            this.sanitizeQuery(request, queryApiKey);
            return true;
        }

        const apiKey =
            request.headers['x-api-key']?.toString() ||
            queryApiKey;

        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);

        this.logger.debug(`Request Received: ${safeOriginalUrl}`);
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
            this.sanitizeQuery(request, queryApiKey);
            return true;
        }

        this.logger.warn(`❌ Access denied — no condition satisfied`);
        this.notifyUnauthorized(clientIp, origin, safeOriginalUrl);
        throw new UnauthorizedException(
            'Access denied',
        );
    }

    private sanitizeQuery(request: Request, queryApiKey?: string): void {
        if (queryApiKey) {
            Object.defineProperty(request, 'authQueryApiKey', {
                value: queryApiKey,
                writable: true,
                configurable: true,
                enumerable: false,
            });
        }

        const query = request.query as Record<string, unknown> | undefined;
        if (query) {
            const sanitizedQuery = { ...query };
            delete sanitizedQuery.apiKey;
            delete sanitizedQuery.apikey;
            delete sanitizedQuery.api_key;
            Object.defineProperty(request, 'query', {
                value: sanitizedQuery,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }

        this.sanitizeUrlField(request, 'url');
        this.sanitizeUrlField(request, 'originalUrl');
    }

    private sanitizeUrlField(request: Request, field: 'url' | 'originalUrl'): void {
        const currentValue = request[field];
        if (!currentValue) return;

        Object.defineProperty(request, field, {
            value: this.stripQuerySecret(currentValue),
            writable: true,
            configurable: true,
            enumerable: true,
        });
    }

    private redactQuerySecret(url: string): string {
        return url.replace(/([?&](?:apiKey|apikey|api_key)=)[^&]*/gi, '$1[redacted]');
    }

    private stripQuerySecret(url: string): string {
        try {
            const parsed = new URL(url, 'http://internal.local');
            parsed.searchParams.delete('apiKey');
            parsed.searchParams.delete('apikey');
            parsed.searchParams.delete('api_key');
            const search = parsed.searchParams.toString();
            return `${parsed.pathname}${search ? `?${search}` : ''}${parsed.hash}`;
        } catch {
            return this.redactQuerySecret(url);
        }
    }

    // Ignored paths that expose a mutating route at the same URL (so the bypass must be
    // restricted to safe HTTP methods only). e.g. GET /builds is public, PATCH /builds is not.
    private static readonly WRITE_PROTECTED_IGNORE_PATHS: (string | RegExp)[] = ['/builds'];

    private isWriteProtectedIgnorePath(...urls: string[]): boolean {
        for (const urlToTest of urls.filter(Boolean)) {
            for (const guarded of AuthGuard.WRITE_PROTECTED_IGNORE_PATHS) {
                if (typeof guarded === 'string') {
                    if (guarded.toLowerCase() === urlToTest.toLowerCase()) return true;
                } else if (guarded.test(urlToTest)) {
                    return true;
                }
            }
        }
        return false;
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
        // Express represents a header sent multiple times as string[]. Downstream callers
        // (e.g. xForwardedFor.split(',')) assume a string, so normalize to the first value to
        // avoid a TypeError crash (500). Fail-closed: a malformed array header simply won't
        // match any allowlist entry.
        const raw = request.headers[headerName.toLowerCase()];
        if (Array.isArray(raw)) return raw[0];
        return raw as string | undefined;
    }

    private extractRealClientIP(request: Request): string {
        // SECURITY / TRUST BOUNDARY:
        // The cf-connecting-ip / x-real-ip / x-forwarded-for headers are client-supplied and
        // therefore SPOOFABLE. They are only trustworthy when this service is reached EXCLUSIVELY
        // through the Cloudflare/nginx hop that sets them (the production topology). If the service
        // is ever directly reachable, an attacker could set `cf-connecting-ip: <an allowlisted IP>`
        // and bypass the IP allowlist.
        //
        // We honor these headers by default (production runs behind the proxy), but allow them to
        // be disabled via TRUST_PROXY_HEADERS=false for deployments where the proxy hop is not
        // guaranteed — in which case only the real socket peer is used.
        const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS !== 'false';

        if (trustProxyHeaders) {
            // Cloudflare first
            const cfConnectingIP = this.getHeaderValue(request, 'cf-connecting-ip');
            if (cfConnectingIP) return cfConnectingIP;

            // Nginx-provided IPs
            const xRealIP = this.getHeaderValue(request, 'x-real-ip');
            if (xRealIP) return xRealIP;

            const xForwardedFor = this.getHeaderValue(request, 'x-forwarded-for');
            if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
        }

        // Real socket peer (the only non-spoofable source).
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
            const botsService = getBotsServiceInstance();
            if (!botsService) {
                this.logger.warn(`BotsService instance not available for notifications`);
                return;
            }else{
                botsService.sendMessageByCategory(
                    ChannelCategory.UNAUTH_CALLS,
                    `<b>Unauthorized Attempt</b>\n\n<b>IP:</b> ${clientIp || 'unknown'}\n<b>Origin:</b> ${origin || 'unknown'}\n<b>Path:</b> ${originalUrl || 'unknown'}`,
                    { parseMode: 'HTML' }
                );
                return;
            }
        } catch (err) {
            this.logger.error(`Notifbot failed: ${err.message}`);
        }
    }
}

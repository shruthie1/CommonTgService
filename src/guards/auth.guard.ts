import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { fetchWithTimeout } from '../utils';
import { notifbot } from '../utils/logbots';

const ALLOWED_IPS = ['31.97.59.2', '148.230.84.50', '13.228.225.19', '18.142.128.26', '54.254.162.138'];
const ALLOWED_ORIGINS = [
    'https://paidgirl.site',
    'https://zomcall.netlify.app',
    'https://tgchats.netlify.app',
    'https://tg-chats.netlify.app',
    'https://report-upi.netlify.app'
].map(origin => origin.toLowerCase());

// ✅ Updated ignore list with better patterns
const IGNORE_PATHS: (string | RegExp)[] = [
    '/',
    '/favicon.ico',           // Exact favicon path
    /^\/favicon\//i,         // Favicon directory
    /^\/blockuserall\//i,
    /^\/sendtoall\//i,
    /^\/sendtochannel($|\/)/i, // sendtochannel and any subpaths
    '/apim',
    '/health',
    /^\/public($|\/)/i,      // public directory and subpaths
];

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        // Use both path and url for better matching
        const path = request.path;
        const url = request.url; // includes query parameters
        const originalUrl = request.originalUrl;

        const apiKey =
            request.headers['x-api-key']?.toString() ||
            request.query['apiKey']?.toString();
        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);

        // ✅ Enhanced path checking with debugging
        if (this.isIgnoredPath(path, url, originalUrl)) {
            // this.logger.debug(`✅ Path ignored: ${path} (url: ${url})`);
            return true;
        }

        this.logger.debug(`Request Received: ${originalUrl}`);
        // this.logger.debug(`→ API Key: ${apiKey || 'NONE'}`);
        // this.logger.debug(`→ Client IP: ${clientIp}`);
        // this.logger.debug(`→ Origin: ${origin || 'NONE'}`);

        let passedReason: string | null = null;

        // Check API Key (case-insensitive)
        if (apiKey && apiKey.toLowerCase() === "santoor") {
            // this.logger.debug(`✅ API Key matched`);
            passedReason = 'API key valid';
        } else {
            this.logger.debug(`❌ API Key mismatch`);
        }

        // Check IP
        if (!passedReason && ALLOWED_IPS.includes(clientIp)) {
            // this.logger.debug(`✅ IP allowed`);
            passedReason = 'IP allowed';
        } else if (!passedReason) {
            this.logger.debug(`❌ IP not allowed`);
        }

        // Check Origin (case-insensitive)
        if (!passedReason && origin && this.isOriginAllowed(origin)) {
            // this.logger.debug(`✅ Origin allowed`);
            passedReason = 'Origin allowed';
        } else if (!passedReason) {
            this.logger.debug(`❌ Origin not allowed`);
        }

        if (passedReason) {
            // this.logger.debug(`Access granted because: ${passedReason}`);
            return true;
        }

        this.logger.warn(`❌ Access denied — no condition satisfied`);
        fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(
            `${process.env.clientId || process.env.serviceName} Failed :: Unauthorized access attempt from ${clientIp || 'unknown IP'} with origin ${origin || 'unknown origin'} for ${originalUrl}`
        )}`);
        throw new UnauthorizedException('Access denied: No valid API key, IP, or Origin');
    }

    /**
     * Enhanced path checking with multiple URL formats and better debugging
     */
    private isIgnoredPath(path: string, url: string, originalUrl: string): boolean {
        // Test against all URL variations
        const urlsToTest = [path, url, originalUrl].filter(Boolean);

        for (const urlToTest of urlsToTest) {
            for (const ignore of IGNORE_PATHS) {
                if (typeof ignore === 'string') {
                    // Exact string match
                    if (ignore.toLowerCase() === urlToTest.toLowerCase()) {
                        // this.logger.debug(`✅ Exact match: ${ignore} === ${urlToTest}`);
                        return true;
                    }
                } else {
                    // Regex match
                    if (ignore.test(urlToTest)) {
                        // this.logger.debug(`✅ Regex match: ${ignore} matches ${urlToTest}`);
                        return true;
                    }
                }
            }
        }

        // Debug output for non-matching paths
        // this.logger.debug(`❌ No ignore pattern matched for: path="${path}", url="${url}", originalUrl="${originalUrl}"`);
        return false;
    }

    /**
     * Check if origin is allowed (case-insensitive)
     */
    private isOriginAllowed(origin: string): boolean {
        if (!origin) return false;

        const normalizedOrigin = origin.toLowerCase().trim();
        return ALLOWED_ORIGINS.includes(normalizedOrigin);
    }

    /**
     * Get header value with case-insensitive lookup
     */
    private getHeaderValue(request: Request, headerName: string): string | undefined {
        return request.headers[headerName.toLowerCase()] as string;
    }

    /**
     * Extract the real client IP considering proxy headers in priority order
     */
    private extractRealClientIP(request: Request): string {
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

    /**
     * Extract the real origin considering proxy headers and nginx configuration
     */
    private extractRealOrigin(request: Request): string | undefined {
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
            } catch (error) {
                this.logger.debug(`Failed to parse referer as URL: ${referer}`);
            }
        }

        this.logger.debug(`Unable to extract origin from any header`);
        return undefined;
    }

    /**
     * Extract the protocol considering proxy headers
     */
    private extractProtocol(request: Request): string {
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
            } catch (error) {
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
}
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { fetchWithTimeout } from '../utils';
import { notifbot } from '../utils/logbots';

const ALLOWED_IPS = ['31.97.59.2', '148.230.84.50', '13.228.225.19', '18.142.128.26', '54.254.162.138'];
const ALLOWED_ORIGINS = [
    'https://paidgirl.site',
    'https://zomcall.netlify.app',
    'https://ums-test.paidgirl.site', // Your nginx server
    'http://localhost:3000', // Development
    'http://localhost:3001', // Development
    'http://localhost:5002', // Local backend
].map(origin => origin.toLowerCase()); // Normalize all origins to lowercase

// ✅ Ignore list (exact paths or regex)
const IGNORE_PATHS: (string | RegExp)[] = [
    '/',
    /^\/sendtochannel\//i,
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
        const clientIp = this.extractRealClientIP(request);
        const origin = this.extractRealOrigin(request);


        // ✅ Skip if path is in ignore list
        if (this.isIgnoredPath(path)) {
            return true;
        }


        this.logger.debug(`Request Received: ${request.originalUrl}`);
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
        // if (!passedReason && origin && this.isOriginAllowed(origin)) {
        //     // this.logger.debug(`✅ Origin allowed`);
        //     passedReason = 'Origin allowed';
        // } else if (!passedReason) {
        //     this.logger.debug(`❌ Origin not allowed`);
        // }

        if (passedReason) {
            // this.logger.debug(`Access granted because: ${passedReason}`);
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

    /**
     * Check if origin is allowed (case-insensitive)
     */
    // private isOriginAllowed(origin: string): boolean {
    //     if (!origin) return false;

    //     const normalizedOrigin = origin.toLowerCase().trim();

    //     // Since ALLOWED_ORIGINS is already normalized to lowercase, direct comparison works
    //     return ALLOWED_ORIGINS.includes(normalizedOrigin);
    // }

    /**
     * Get header value with case-insensitive lookup
     */
    private getHeaderValue(request: Request, headerName: string): string | undefined {
        // Express.js already handles case-insensitive headers, but let's be explicit
        return request.headers[headerName.toLowerCase()] as string;
    }

    /**
     * Extract the real client IP considering proxy headers in priority order
     */
    private extractRealClientIP(request: Request): string {
        // Priority order for IP extraction:
        // 1. CF-Connecting-IP (Cloudflare)
        // 2. X-Real-IP (nginx proxy)
        // 3. X-Forwarded-For (first IP in chain)
        // 4. request.ip (Express default)
        // 5. connection.remoteAddress (fallback)

        const cfConnectingIP = this.getHeaderValue(request, 'cf-connecting-ip');
        if (cfConnectingIP) {
            // this.logger.debug(`Using CF-Connecting-IP: ${cfConnectingIP}`);
            return cfConnectingIP;
        }

        const xRealIP = this.getHeaderValue(request, 'x-real-ip');
        if (xRealIP) {
            // this.logger.debug(`Using X-Real-IP: ${xRealIP}`);
            return xRealIP;
        }

        const xForwardedFor = this.getHeaderValue(request, 'x-forwarded-for');
        if (xForwardedFor) {
            // X-Forwarded-For can contain multiple IPs, take the first one (original client)
            const firstIP = xForwardedFor.split(',')[0].trim();
            // this.logger.debug(`Using X-Forwarded-For (first): ${firstIP}`);
            return firstIP;
        }

        const expressIP = request.ip;
        if (expressIP) {
            const cleanIP = expressIP.replace('::ffff:', '');
            // this.logger.debug(`Using Express IP: ${cleanIP}`);
            return cleanIP;
        }

        const connectionIP = request.connection?.remoteAddress;
        if (connectionIP) {
            const cleanIP = connectionIP.replace('::ffff:', '');
            // this.logger.debug(`Using connection remoteAddress: ${cleanIP}`);
            return cleanIP;
        }

        this.logger.warn(`Unable to extract client IP, using fallback`);
        return 'unknown';
    }

    /**
     * Extract the real origin considering proxy headers and nginx configuration
     */
    private extractRealOrigin(request: Request): string | undefined {
        // Priority order for origin extraction based on your nginx config:
        // 1. Origin header (direct from client)
        // 2. X-Original-Host (nginx proxy header you're setting)
        // 3. X-Forwarded-Host (standard proxy header)
        // 4. Host header (fallback)
        // 5. Referer header (as last resort for origin detection)

        const origin = this.getHeaderValue(request, 'origin');
        if (origin) {
            // this.logger.debug(`Using Origin header: ${origin}`);
            return origin;
        }

        const xOriginalHost = this.getHeaderValue(request, 'x-original-host');
        if (xOriginalHost) {
            // Construct origin from X-Original-Host with proper protocol
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xOriginalHost}`;
            // this.logger.debug(`Using X-Original-Host to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }

        const xForwardedHost = this.getHeaderValue(request, 'x-forwarded-host');
        if (xForwardedHost) {
            // Construct origin from X-Forwarded-Host with proper protocol
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${xForwardedHost}`;
            // this.logger.debug(`Using X-Forwarded-Host to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }

        const host = this.getHeaderValue(request, 'host');
        if (host) {
            // Construct origin from Host header with proper protocol
            const protocol = this.extractProtocol(request);
            const constructedOrigin = `${protocol}://${host}`;
            // this.logger.debug(`Using Host header to construct origin: ${constructedOrigin}`);
            return constructedOrigin;
        }

        const referer = this.getHeaderValue(request, 'referer');
        if (referer) {
            try {
                // Extract origin from referer URL
                const refererUrl = new URL(referer);
                const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
                // this.logger.debug(`Using Referer to extract origin: ${refererOrigin}`);
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
        // Check X-Forwarded-Proto first (set by your nginx)
        const xForwardedProto = this.getHeaderValue(request, 'x-forwarded-proto');
        if (xForwardedProto) {
            // this.logger.debug(`Using X-Forwarded-Proto: ${xForwardedProto}`);
            return xForwardedProto.toLowerCase(); // Normalize to lowercase
        }

        // Check if Cloudflare indicates HTTPS
        const cfVisitor = this.getHeaderValue(request, 'cf-visitor');
        if (cfVisitor) {
            try {
                const visitor = JSON.parse(cfVisitor);
                if (visitor.scheme) {
                    // this.logger.debug(`Using CF-Visitor scheme: ${visitor.scheme}`);
                    return visitor.scheme.toLowerCase(); // Normalize to lowercase
                }
            } catch (error) {
                this.logger.debug(`Failed to parse CF-Visitor: ${cfVisitor}`);
            }
        }

        // Check if request is encrypted (Express.js)
        if (request.secure) {
            // this.logger.debug(`Using request.secure: https`);
            return 'https';
        }

        // Check X-Forwarded-SSL header
        const xForwardedSsl = this.getHeaderValue(request, 'x-forwarded-ssl');
        if (xForwardedSsl && xForwardedSsl.toLowerCase() === 'on') {
            // this.logger.debug(`Using X-Forwarded-SSL: https`);
            return 'https';
        }

        // Default to HTTPS for production environments (since you have SSL configured)
        if (process.env.NODE_ENV === 'production') {
            // this.logger.debug(`Production environment, defaulting to https`);
            return 'https';
        }

        // Default to HTTP for development
        // this.logger.debug(`Development environment, defaulting to http`);
        return 'http';
    }
}

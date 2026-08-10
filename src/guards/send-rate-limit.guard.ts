import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

/**
 * Per-IP sliding-window rate limiter for bot SEND endpoints (/sendToChannel and the
 * /bots/category/:category message|photo|video sends).
 *
 * WHY: these endpoints trigger Telegram bot sends. /sendToChannel is auth-whitelisted (unauthenticated)
 * and is the fallback path vcui hits from user browsers — so an uncapped flood of sends (a runaway
 * client, a retry storm, or an abuser holding a leaked token) can hammer Telegram and get bots
 * flood-limited/kicked (the VC_NOTIFICATIONS incident). A per-IP cap keeps any single source's send
 * rate bounded regardless of the caller.
 *
 * IP SOURCE: mirrors AuthGuard.extractRealClientIP — Cloudflare CF-Connecting-IP first (production
 * runs browser → Cloudflare → nginx → node), falling back to x-real-ip / x-forwarded-for / socket.
 * Honoring proxy headers is gated by TRUST_PROXY_HEADERS (same as the auth guard) — these headers are
 * spoofable if the service is reachable off-proxy, but the production topology is proxy-only.
 *
 * IMPLEMENTATION: bounded in-memory Map<ip, number[]> of send timestamps within the window. No new
 * dependency, no global guard wiring (applied only to the send endpoints via @UseGuards), bounded
 * memory (a periodic sweep evicts idle IPs). Limit is env-tunable: RATE_LIMIT_SENDS_PER_MIN (default 30).
 */
@Injectable()
export class SendRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(SendRateLimitGuard.name);
    private readonly windowMs = 60_000;
    private readonly hits = new Map<string, number[]>();
    private lastSweep = 0;

    private get limit(): number {
        const n = Number(process.env.RATE_LIMIT_SENDS_PER_MIN);
        return Number.isFinite(n) && n > 0 ? n : 30;
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const now = Date.now();
        const ip = this.extractRealClientIP(req);

        // Periodic sweep of idle IPs so the Map can't grow unbounded (bounded-cache discipline).
        if (now - this.lastSweep > this.windowMs) {
            this.lastSweep = now;
            for (const [k, arr] of this.hits) {
                if (arr.length === 0 || now - arr[arr.length - 1] > this.windowMs) this.hits.delete(k);
            }
        }

        const arr = this.hits.get(ip) ?? [];
        // Drop timestamps outside the sliding window.
        const fresh = arr.filter((t) => now - t < this.windowMs);
        if (fresh.length >= this.limit) {
            this.hits.set(ip, fresh);
            this.logger.warn(`Send rate limit hit: ip=${ip} count=${fresh.length}/${this.limit} in ${this.windowMs}ms`);
            throw new HttpException(
                { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: `Send rate limit exceeded (${this.limit}/min per IP)` },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        fresh.push(now);
        this.hits.set(ip, fresh);
        return true;
    }

    private extractRealClientIP(req: Request): string {
        const header = (name: string): string | undefined => {
            const raw = req.headers[name];
            return Array.isArray(raw) ? raw[0] : (raw as string | undefined);
        };
        if (process.env.TRUST_PROXY_HEADERS !== 'false') {
            const cf = header('cf-connecting-ip');
            if (cf) return cf;
            const xr = header('x-real-ip');
            if (xr) return xr;
            const xff = header('x-forwarded-for');
            if (xff) return xff.split(',')[0].trim();
        }
        if (req.ip) return req.ip.replace('::ffff:', '');
        if (req.connection?.remoteAddress) return req.connection.remoteAddress.replace('::ffff:', '');
        return 'unknown';
    }
}

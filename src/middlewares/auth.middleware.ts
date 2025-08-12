import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
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
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.path;
    const url = req.url;
    const originalUrl = req.originalUrl;

    // ✅ Step 1: Skip ignored paths
    if (this.isIgnoredPath(path, url, originalUrl)) {
      return next();
    }

    const apiKey =
      req.headers['x-api-key']?.toString() ||
      req.query['apiKey']?.toString();

    const clientIp = this.extractRealClientIP(req);
    const origin = this.extractRealOrigin(req);

    this.logger.debug(`Request Received: ${originalUrl}`);

    let passedReason: string | null = null;

    // ✅ Step 2: Checks
    if (apiKey && apiKey.toLowerCase() === 'santoor') {
      passedReason = 'API key valid';
    } else if (ALLOWED_IPS.includes(clientIp)) {
      passedReason = 'IP allowed';
    } else if (origin && this.isOriginAllowed(origin)) {
      passedReason = 'Origin allowed';
    }

    // ✅ Step 3: Decision
    if (passedReason) {
      return next();
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
    req: Request,
    headerName: string,
  ): string | undefined {
    return req.headers[headerName.toLowerCase()] as string;
  }

  private extractRealClientIP(req: Request): string {
    const cfConnectingIP = this.getHeaderValue(req, 'cf-connecting-ip');
    if (cfConnectingIP) return cfConnectingIP;

    const xRealIP = this.getHeaderValue(req, 'x-real-ip');
    if (xRealIP) return xRealIP;

    const xForwardedFor = this.getHeaderValue(req, 'x-forwarded-for');
    if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

    if (req.ip) return req.ip.replace('::ffff:', '');
    if (req.connection?.remoteAddress)
      return req.connection.remoteAddress.replace('::ffff:', '');

    this.logger.warn(`Unable to extract client IP`);
    return 'unknown';
  }

  private extractRealOrigin(req: Request): string | undefined {
    const origin = this.getHeaderValue(req, 'origin');
    if (origin) return origin;

    const xOriginalHost = this.getHeaderValue(req, 'x-original-host');
    if (xOriginalHost)
      return `${this.extractProtocol(req)}://${xOriginalHost}`;

    const xForwardedHost = this.getHeaderValue(req, 'x-forwarded-host');
    if (xForwardedHost)
      return `${this.extractProtocol(req)}://${xForwardedHost}`;

    const host = this.getHeaderValue(req, 'host');
    if (host) return `${this.extractProtocol(req)}://${host}`;

    const referer = this.getHeaderValue(req, 'referer');
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

  private extractProtocol(req: Request): string {
    const xForwardedProto = this.getHeaderValue(req, 'x-forwarded-proto');
    if (xForwardedProto) return xForwardedProto.toLowerCase();

    const cfVisitor = this.getHeaderValue(req, 'cf-visitor');
    if (cfVisitor) {
      try {
        const visitor = JSON.parse(cfVisitor);
        if (visitor.scheme) return visitor.scheme.toLowerCase();
      } catch {
        this.logger.debug(`Failed to parse CF-Visitor`);
      }
    }

    if (req.secure) return 'https';
    const xForwardedSsl = this.getHeaderValue(req, 'x-forwarded-ssl');
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

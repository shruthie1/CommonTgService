import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { parseError } from '../utils/parseError';
import { BotConfig, ChannelCategory } from '../utils/TelegramBots.config';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, baseUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const ip = req.ip;

    const excludedEndpoints = [
      '/sendtochannel',
      '/favicon.',
      '/tgsignup',
      '/timestamps',
    ];
    const isExcluded = (url: string) =>
      excludedEndpoints.some((endpoint) => url.startsWith(endpoint));
    if (!isExcluded(originalUrl) && originalUrl !== '/') {
      res.on('finish', () => {
        const { statusCode } = res;
        const contentLength = res.get('content-length');
        if (statusCode >= 500) {
          BotConfig.getInstance().sendMessage(ChannelCategory.HTTP_FAILURES,
            `Threw Status ${statusCode} for ${originalUrl}`,
          );
          this.logger.error(
            `${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`,
          );
        } else if (statusCode >= 400) {
          BotConfig.getInstance().sendMessage(ChannelCategory.HTTP_FAILURES,
            `Threw Status ${statusCode} for ${originalUrl}`,
          );
          this.logger.warn(
            `${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`,
          );
        } else if (statusCode >= 300) {
          this.logger.verbose(
            `${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`,
          );
        } else {
          this.logger.log(
            `${method} ${originalUrl} ${req.ip} || StatusCode : ${statusCode}`,
          );
        }
      });
      res.on('error', (error) => {
        const errorDetails = parseError(error, process.env.clientId);
        BotConfig.getInstance().sendMessage(ChannelCategory.HTTP_FAILURES,
          `Error at req for ${originalUrl}\nMessage: ${errorDetails.message}`,
        );
      });
    } else {
      if (originalUrl.includes('Video')) {
        this.logger.log(
          `Excluded endpoint hit: ${originalUrl} (length: ${originalUrl.length})`,
        );
      }
    }

    next();
  }
}

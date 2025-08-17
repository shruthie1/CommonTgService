import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { parseError } from '../utils/parseError';
import { BotConfig, ChannelCategory } from '../utils/TelegramBots.config';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const startTime = Date.now(); // Capture start time
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
        const duration = Date.now() - startTime; // Duration in ms
        const durationStr =
          duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;

        if (statusCode >= 500) {
          BotConfig.getInstance().sendMessage(
            ChannelCategory.HTTP_FAILURES,
            `Threw Status ${statusCode} for ${originalUrl}`
          );
          this.logger.error(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 400) {
          BotConfig.getInstance().sendMessage(
            ChannelCategory.HTTP_FAILURES,
            `Threw Status ${statusCode} for ${originalUrl}`
          );
          this.logger.warn(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 300) {
          this.logger.verbose(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else {
          this.logger.log(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        }
      });

      res.on('error', (error) => {
        const errorDetails = parseError(error, process.env.clientId);
        BotConfig.getInstance().sendMessage(
          ChannelCategory.HTTP_FAILURES,
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

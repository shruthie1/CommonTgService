import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { parseError } from '../utils/parseError';
import { getBotsServiceInstance, Logger } from '../utils';
import { ChannelCategory } from '../components';

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
        const botsService  = getBotsServiceInstance();
        if (!botsService) {
            this.logger.warn(`BotsService instance not available for notifications`);
            return;
        }

        if (statusCode >= 500) {
          botsService.sendMessageByCategory(
            ChannelCategory.HTTP_FAILURES,
            `<b>HTTP ${statusCode}</b>\n\n<b>Path:</b> ${originalUrl}\n<b>Method:</b> ${method}\n<b>IP:</b> ${ip}\n<b>Duration:</b> ${durationStr}`,
            { parseMode: 'HTML' }
          );
          this.logger.error(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 400) {
          botsService.sendMessageByCategory(
            ChannelCategory.HTTP_FAILURES,
            `<b>HTTP ${statusCode}</b>\n\n<b>Path:</b> ${originalUrl}\n<b>Method:</b> ${method}\n<b>IP:</b> ${ip}\n<b>Duration:</b> ${durationStr}`,
            { parseMode: 'HTML' }
          );
          this.logger.warn(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 300) {
          this.logger.verbose(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else {
          this.logger.debug(
            `${method} ${originalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        }
      });

      res.on('error', (error) => {
        const errorDetails = parseError(error, process.env.clientId);
        const botsService  = getBotsServiceInstance();
        if (!botsService) {
            this.logger.warn(`BotsService instance not available for notifications`);
            return;
        }
        botsService.sendMessageByCategory(
          ChannelCategory.HTTP_FAILURES,
          `<b>HTTP Request Error</b>\n\n<b>Path:</b> ${originalUrl}\n<b>Error:</b> ${errorDetails.message?.substring(0, 200)}`,
          { parseMode: 'HTML' }
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

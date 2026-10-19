import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { parseError } from '../utils/parseError';
import { getBotsServiceInstance, Logger } from '../utils';
import { ChannelCategory } from '../components';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method } = req;
    const originalUrl = req.originalUrl;
    const safeOriginalUrl = this.redactQuerySecret(originalUrl);
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
            {
              severity: statusCode >= 500 ? 'error' : 'warning',
              title: `HTTP ${statusCode}`,
              fields: [
                { label: 'Path', value: safeOriginalUrl, code: false },
                { label: 'Method', value: method },
                { label: 'Status', value: statusCode, code: false },
                { label: 'IP', value: ip },
                { label: 'Duration', value: durationStr, code: false },
              ],
            }
          );
          this.logger.error(
            `${method} ${safeOriginalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 400) {
          botsService.sendMessageByCategory(
            ChannelCategory.HTTP_FAILURES,
            {
              severity: statusCode >= 500 ? 'error' : 'warning',
              title: `HTTP ${statusCode}`,
              fields: [
                { label: 'Path', value: safeOriginalUrl, code: false },
                { label: 'Method', value: method },
                { label: 'Status', value: statusCode, code: false },
                { label: 'IP', value: ip },
                { label: 'Duration', value: durationStr, code: false },
              ],
            }
          );
          this.logger.warn(
            `${method} ${safeOriginalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else if (statusCode >= 300) {
          this.logger.verbose(
            `${method} ${safeOriginalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
          );
        } else {
          this.logger.debug(
            `${method} ${safeOriginalUrl} ${ip} || StatusCode: ${statusCode} || Duration: ${durationStr}`,
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
          {
            severity: 'error',
            title: 'HTTP error',
            fields: [{ label: 'Path', value: safeOriginalUrl, code: false }],
            details: errorDetails.message?.substring(0, 200),
            detailsTitle: 'Error message',
          }
        );
      });
    } else {
      if (originalUrl.includes('Video')) {
        this.logger.log(
          `Excluded endpoint hit: ${safeOriginalUrl} (length: ${safeOriginalUrl.length})`,
        );
      }
    }

    next();
  }

  private redactQuerySecret(url: string): string {
    return url.replace(/([?&](?:apiKey|apikey|api_key)=)[^&]*/gi, '$1[redacted]');
  }
}

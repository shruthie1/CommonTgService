import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as chalk from 'chalk';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '';
    const ip = req.ip;

    // List of endpoints to exclude from logging
    const excludedEndpoints = ['/sendtochannel'];

    if (!excludedEndpoints.includes(originalUrl)) {
      res.on('finish', () => {
        const { statusCode } = res;
        const contentLength = res.get('content-length');

        // Determine color based on status code
        let color;
        if (statusCode >= 500) {
          color = chalk.red;
        } else if (statusCode >= 400) {
          color = chalk.yellow;
        } else if (statusCode >= 300) {
          color = chalk.cyan;
        } else {
          color = chalk.green;
        }

        this.logger.log(
          color(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`)
        );
      });
    }

    next();
  }
}


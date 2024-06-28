import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

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
        if (statusCode >= 500) {
          this.logger.error(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`);
        } else if (statusCode >= 400) {
            this.logger.warn(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`);
        } else if (statusCode >= 300) {
            this.logger.verbose(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`);
        } else {
            this.logger.log(`${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`);
        }
      });
    }else{
        this.logger.log(`Url Length : ${originalUrl.length}`)
    }

    next();
  }
}


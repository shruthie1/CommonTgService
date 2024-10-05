import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { fetchWithTimeout, parseError, ppplbot } from 'src/utils';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl, baseUrl } = req;
        const userAgent = req.get('user-agent') || '';
        const ip = req.ip;

        const excludedEndpoints = ['/sendtochannel', '/favicon.', '/tgsignup'];
        const isExcluded = (url: string) => excludedEndpoints.some(endpoint => url.startsWith(endpoint));
        if (!isExcluded(originalUrl) && originalUrl !== '/') {
            res.on('finish', () => {
                const { statusCode } = res;
                const contentLength = res.get('content-length');
                if (statusCode >= 500) {
                    fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
                    this.logger.error(`${method} ${originalUrl} || StatusCode : ${statusCode}`);
                } else if (statusCode >= 400) {
                    fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${statusCode}`)}`);
                    this.logger.warn(`${method} ${originalUrl} || StatusCode : ${statusCode}`);
                } else if (statusCode >= 300) {
                    this.logger.verbose(`${method} ${originalUrl} || StatusCode : ${statusCode}`);
                } else {
                    this.logger.log(`${method} ${originalUrl} || StatusCode : ${statusCode}`);
                }
            });
            res.on('error', (error) => {
                const errorDetails = parseError(error, process.env.clientId);
                fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(`Failed :: ${originalUrl} with ${errorDetails.message}`)}`);
            })
        } else {
            if (originalUrl.includes('Video')) {
                this.logger.log(`Excluded endpoint hit: ${originalUrl} (length: ${originalUrl.length})`);
            }
        }

        next();
    }
}

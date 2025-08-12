import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export declare class AuthMiddleware implements NestMiddleware {
    private readonly logger;
    use(req: Request, res: Response, next: NextFunction): void;
    private isIgnoredPath;
    private isOriginAllowed;
    private getHeaderValue;
    private extractRealClientIP;
    private extractRealOrigin;
    private extractProtocol;
    private notifyUnauthorized;
}

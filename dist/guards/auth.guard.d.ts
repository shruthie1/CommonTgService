import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class AuthGuard implements CanActivate {
    private readonly logger;
    canActivate(context: ExecutionContext): boolean;
    private isIgnoredPath;
    private getHeaderValue;
    private extractRealClientIP;
    private extractRealOrigin;
    private extractProtocol;
}

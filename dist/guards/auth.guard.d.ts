import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class AuthGuard implements CanActivate {
    private readonly logger;
    canActivate(context: ExecutionContext): boolean;
    private sanitizeQuery;
    private sanitizeUrlField;
    private redactQuerySecret;
    private stripQuerySecret;
    private static readonly WRITE_PROTECTED_IGNORE_PATHS;
    private isWriteProtectedIgnorePath;
    private isIgnoredPath;
    private isOriginAllowed;
    private getHeaderValue;
    private extractRealClientIP;
    private extractRealOrigin;
    private extractProtocol;
    private notifyUnauthorized;
}

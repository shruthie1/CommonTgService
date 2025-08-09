import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class ApiKeyOrIpOrOriginGuard implements CanActivate {
    private readonly logger;
    canActivate(context: ExecutionContext): boolean;
}

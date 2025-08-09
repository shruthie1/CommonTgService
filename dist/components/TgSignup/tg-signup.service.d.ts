import { OnModuleDestroy } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { TgSignupResponse } from "./dto/tg-signup.dto";
export declare class TgSignupService implements OnModuleDestroy {
    private readonly usersService;
    private readonly logger;
    private static readonly LOGIN_TIMEOUT;
    private static readonly SESSION_CLEANUP_INTERVAL;
    private static readonly PHONE_PREFIX;
    private readonly cleanupInterval;
    private static readonly activeClients;
    constructor(usersService: UsersService);
    onModuleDestroy(): Promise<void>;
    private cleanupStaleSessions;
    private validatePhoneNumber;
    private disconnectClient;
    sendCode(phone: string): Promise<Pick<TgSignupResponse, 'phoneCodeHash' | 'isCodeViaApp'>>;
    verifyCode(phone: string, code: string, password?: string): Promise<TgSignupResponse>;
    private handle2FALogin;
    private handleNewUserRegistration;
    private processLoginResult;
}

import { Api } from 'telegram';
import { TgContext, SessionInfo } from './types';
export declare function isOwnAuth(auth: Api.Authorization): boolean;
export declare function removeOtherAuths(ctx: TgContext): Promise<void>;
export declare function getAuths(ctx: TgContext): Promise<Api.account.Authorizations>;
export declare function getLastActiveTime(ctx: TgContext): Promise<string>;
export declare function hasPassword(ctx: TgContext): Promise<boolean>;
export declare function set2fa(ctx: TgContext): Promise<{
    email: string;
    hint: string;
    newPassword: string;
} | void>;
export declare function createNewSession(ctx: TgContext): Promise<string>;
export declare function waitForOtp(ctx: TgContext): Promise<string>;
export declare function getSessionInfo(ctx: TgContext): Promise<SessionInfo>;
export declare function terminateSession(ctx: TgContext, options: {
    hash: string;
    type: 'app' | 'web';
    exceptCurrent?: boolean;
}): Promise<boolean>;

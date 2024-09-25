import { Api } from "telegram/tl";
import { TelegramClient } from "telegram";
export declare function restAcc(phoneNumber: any): Promise<void>;
export declare function getClient(number: any): TgSignupService;
export declare function hasClient(number: any): Promise<boolean>;
export declare function deleteClient(number: any): Promise<boolean>;
export declare function disconnectAll(): Promise<void>;
export declare function createClient(number: any): Promise<{
    phoneCodeHash: string;
    isCodeViaApp: boolean;
}>;
export declare class TgSignupService {
    session: any;
    phoneNumber: any;
    client: TelegramClient;
    phoneCodeHash: any;
    apiId: number;
    apiHash: string;
    constructor(number: any, apiId: number, apiHash: string);
    getLastActiveTime(): Promise<number>;
    disconnect(): Promise<void>;
    createClient(): Promise<void>;
    deleteMessages(): Promise<void>;
    sendCode(forceSMS?: boolean): Promise<{
        phoneCodeHash: string;
        isCodeViaApp: boolean;
    }>;
    login(phoneCode: any, passowrd?: any): Promise<Api.User | Api.UserEmpty | {
        status: number;
        message: any;
    }>;
    getCallLogs(): Promise<{
        outgoing: number;
        incoming: number;
        video: number;
        chatCallCounts: {};
        totalCalls: number;
    }>;
    processLogin(result: any, passowrd?: any): Promise<void>;
}

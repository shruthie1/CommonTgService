export declare class TgSignupController {
    constructor();
    sendCode(phone: string): Promise<{
        phoneCodeHash: string;
        isCodeViaApp: boolean;
    }>;
    verifyCode(phone: string, code: string, password: string): Promise<{
        mesaage: any;
    }>;
}

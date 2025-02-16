export declare class SendCodeDto {
    phone: string;
}
export declare class VerifyCodeDto {
    phone: string;
    code: string;
    password?: string | undefined;
}
export declare class TgSignupResponse {
    status: number;
    message: string;
    phoneCodeHash?: string;
    isCodeViaApp?: boolean;
    session?: string;
    requires2FA?: boolean;
}

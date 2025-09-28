export interface ITelegramCredentials {
    apiId: number;
    apiHash: string;
}
export declare function getCredentialsForMobile(mobile: string): Promise<ITelegramCredentials>;

export interface ITelegramCredentials {
    apiId: number;
    apiHash: string;
}
export declare function getCredentialsForMobile(mobile: string, ttl?: number): Promise<ITelegramCredentials>;

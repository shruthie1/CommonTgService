interface ITelegramCredentials {
    apiId: number;
    apiHash: string;
}
export declare function getRandomCredentials(): ITelegramCredentials;
export {};

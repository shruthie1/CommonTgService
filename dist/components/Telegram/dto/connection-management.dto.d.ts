export declare class ConnectionStatusDto {
    state: string;
    autoDisconnect: boolean;
    lastUsed: number;
    connectionAttempts: number;
    lastError?: string;
}
export declare class GetClientOptionsDto {
    autoDisconnect?: boolean;
    handler?: boolean;
}

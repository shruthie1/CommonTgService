import { ClientMetadata } from '../types/client-operations';
export declare class ClientMetadataTracker {
    private static instance;
    private metadata;
    private constructor();
    static getInstance(): ClientMetadataTracker;
    initializeClient(mobile: string): void;
    recordOperation(mobile: string, operation: string, success: boolean): void;
    recordReconnect(mobile: string): void;
    getMetadata(mobile: string): ClientMetadata | undefined;
    getAllMetadata(): Map<string, ClientMetadata>;
    removeClient(mobile: string): void;
    getStatistics(): {
        totalClients: number;
        totalOperations: number;
        failedOperations: number;
        averageReconnects: number;
    };
}

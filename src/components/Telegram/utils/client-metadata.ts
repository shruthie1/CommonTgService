import { ClientMetadata } from '../types/client-operations';

export class ClientMetadataTracker {
    private static instance: ClientMetadataTracker;
    private metadata: Map<string, ClientMetadata> = new Map();

    private constructor() {}

    static getInstance(): ClientMetadataTracker {
        if (!ClientMetadataTracker.instance) {
            ClientMetadataTracker.instance = new ClientMetadataTracker();
        }
        return ClientMetadataTracker.instance;
    }

    initializeClient(mobile: string): void {
        this.metadata.set(mobile, {
            connectedAt: Date.now(),
            lastOperation: '',
            lastOperationTime: 0,
            totalOperations: 0,
            failedOperations: 0,
            reconnectCount: 0
        });
    }

    recordOperation(mobile: string, operation: string, success: boolean): void {
        const data = this.metadata.get(mobile);
        if (data) {
            data.lastOperation = operation;
            data.lastOperationTime = Date.now();
            data.totalOperations++;
            if (!success) {
                data.failedOperations++;
            }
            this.metadata.set(mobile, data);
        }
    }

    recordReconnect(mobile: string): void {
        const data = this.metadata.get(mobile);
        if (data) {
            data.reconnectCount++;
            this.metadata.set(mobile, data);
        }
    }

    getMetadata(mobile: string): ClientMetadata | undefined {
        return this.metadata.get(mobile);
    }

    getAllMetadata(): Map<string, ClientMetadata> {
        return new Map(this.metadata);
    }

    removeClient(mobile: string): void {
        this.metadata.delete(mobile);
    }

    getStatistics(): {
        totalClients: number;
        totalOperations: number;
        failedOperations: number;
        averageReconnects: number;
    } {
        let totalOps = 0;
        let failedOps = 0;
        let totalReconnects = 0;
        const clientCount = this.metadata.size;

        for (const data of this.metadata.values()) {
            totalOps += data.totalOperations;
            failedOps += data.failedOperations;
            totalReconnects += data.reconnectCount;
        }

        return {
            totalClients: clientCount,
            totalOperations: totalOps,
            failedOperations: failedOps,
            averageReconnects: clientCount ? totalReconnects / clientCount : 0
        };
    }
}
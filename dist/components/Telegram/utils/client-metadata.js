"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientMetadataTracker = void 0;
class ClientMetadataTracker {
    constructor() {
        this.metadata = new Map();
    }
    static getInstance() {
        if (!ClientMetadataTracker.instance) {
            ClientMetadataTracker.instance = new ClientMetadataTracker();
        }
        return ClientMetadataTracker.instance;
    }
    initializeClient(mobile) {
        this.metadata.set(mobile, {
            connectedAt: Date.now(),
            lastOperation: '',
            lastOperationTime: 0,
            totalOperations: 0,
            failedOperations: 0,
            reconnectCount: 0
        });
    }
    recordOperation(mobile, operation, success) {
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
    recordReconnect(mobile) {
        const data = this.metadata.get(mobile);
        if (data) {
            data.reconnectCount++;
            this.metadata.set(mobile, data);
        }
    }
    getMetadata(mobile) {
        return this.metadata.get(mobile);
    }
    getAllMetadata() {
        return new Map(this.metadata);
    }
    removeClient(mobile) {
        this.metadata.delete(mobile);
    }
    getStatistics() {
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
exports.ClientMetadataTracker = ClientMetadataTracker;
//# sourceMappingURL=client-metadata.js.map
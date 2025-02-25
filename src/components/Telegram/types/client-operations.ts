import { Dialog } from 'telegram/tl/custom/dialog';
import { Api } from 'telegram';

export interface ClientOperation<T> {
    execute: () => Promise<T>;
    retryCount?: number;
    timeoutMs?: number;
}

export interface DialogOptions {
    limit?: number;
    offsetId?: number;
    offsetDate?: number;
    offsetPeer?: Api.TypePeer;
    ignorePinned?: boolean;
    archived?: boolean;
}

export interface MessageOptions {
    limit?: number;
    offsetId?: number;
    maxId?: number;
    minId?: number;
    fromUser?: string;
}

export interface BulkOperationOptions {
    batchSize?: number;
    delayMs?: number;
    maxRetries?: number;
}

export interface ClientMetadata {
    connectedAt: number;
    lastOperation: string;
    lastOperationTime: number;
    totalOperations: number;
    failedOperations: number;
    reconnectCount: number;
}
import { TelegramClientParams } from "telegram/client/telegramBaseClient";
import { ProxyInterface } from "telegram/network/connection/TCPMTProxy";
export declare function isSocksError(err: unknown): boolean;
export declare function getProxyForMobile(mobile: string): Promise<ProxyInterface>;
export declare function rotateProxy(mobile: string): Promise<ProxyInterface>;
export declare function removeProxyMapping(mobile: string): Promise<void>;
export interface TrackedMobile {
    mobile: string;
    proxy: ProxyInterface;
    consecutiveFails: number;
    lastCheck: Date | null;
    lastLatency: number;
    status: "healthy" | "degraded" | "failed";
}
export declare function setProxyRotatedCallback(fn: (mobile: string, oldProxy: ProxyInterface, newProxy: ProxyInterface, source: string) => void): void;
export declare function setAllFailedCallback(fn: (mobile: string) => void): void;
export declare function handleMobileProxyFailure(mobile: string, error?: unknown): Promise<{
    rotated: boolean;
    reportedToAPI: boolean;
}>;
export declare function getMobileProxyStatus(mobile: string): TrackedMobile | null;
export declare function getAllMobileProxyStatus(): TrackedMobile[];
export declare function stopHealthMonitor(): void;
export interface TGConfigResult {
    apiId: number;
    apiHash: string;
    params: TelegramClientParams;
}
export declare function generateTGConfig(mobile: string, ttl?: number): Promise<TGConfigResult>;
export declare function invalidateConfig(mobile: string): Promise<void>;
export declare function resetMobileIdentity(mobile: string): Promise<void>;

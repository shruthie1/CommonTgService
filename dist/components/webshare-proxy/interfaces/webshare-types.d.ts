export interface WebshareProxy {
    id: string;
    username: string;
    password: string;
    proxy_address: string | null;
    port: number;
    valid: boolean;
    last_verification: string;
    country_code: string;
    city_name: string;
    created_at: string;
}
export interface WebsharePaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}
export interface WebshareProxyConfig {
    username: string;
    password: string;
    request_timeout: number;
    request_idle_timeout: number;
    state: 'pending' | 'processing' | 'completed';
    authorized_ips: string[];
    country_code_list: string[];
    ip_range_list: string[];
    asn_list: number[];
}
export interface WebshareReplacementRequest {
    proxy_address?: string;
    country_code?: string;
}
export interface WebshareReplacement {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
}
export interface WebshareProxyStats {
    total: number;
    active: number;
    inactive: number;
    country_breakdown: Record<string, number>;
}
export interface WebshareSyncResult {
    totalFetched: number;
    created: number;
    updated: number;
    removed: number;
    errors: string[];
    durationMs: number;
}

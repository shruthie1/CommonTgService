import { AxiosRequestConfig, AxiosResponse } from "axios";
export declare function fetchWithTimeout(url: string, options?: AxiosRequestConfig & {
    bypassUrl?: string;
    useIPv6?: boolean;
}, maxRetries?: number): Promise<AxiosResponse>;

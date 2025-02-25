import { AxiosRequestConfig, AxiosResponse } from "axios";
export declare function fetchWithTimeout(url: string, options?: AxiosRequestConfig & {
    bypassUrl?: string;
}, maxRetries?: number): Promise<AxiosResponse | undefined>;

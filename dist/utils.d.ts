import { AxiosRequestConfig } from 'axios';
export declare function sleep(ms: any): Promise<unknown>;
export declare function contains(str: any, arr: any): any;
export declare function fetchWithTimeout(resource: string, options?: AxiosRequestConfig, maxRetries?: number): Promise<import("axios").AxiosResponse<any, any>>;
export declare function fetchNumbersFromString(inputString: any): any;
export declare function parseError(err: any, prefix?: string): {
    status: string;
    message: string;
    error: string;
};
export declare const ppplbot: () => string;

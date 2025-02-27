import { Method } from 'axios';
declare enum ResponseType {
    JSON = "json",
    TEXT = "text",
    STREAM = "stream",
    BLOB = "blob",
    DOCUMENT = "document",
    ARRAYBUFFER = "arraybuffer"
}
export declare class ExecuteRequestDto {
    url: string;
    method?: Method;
    headers?: Record<string, string>;
    data?: any;
    params?: Record<string, string>;
    responseType?: ResponseType;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
}
export {};

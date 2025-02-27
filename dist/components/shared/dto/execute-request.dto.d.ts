import { Method } from 'axios';
export declare enum ResponseType {
    JSON = "json",
    TEXT = "text",
    BLOB = "blob",
    ARRAYBUFFER = "arraybuffer",
    STREAM = "stream"
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

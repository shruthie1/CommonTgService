import { Method } from 'axios';
export declare class ExecuteRequestDto {
    url: string;
    method?: Method;
    headers?: Record<string, string>;
    data?: any;
    params?: Record<string, string>;
}

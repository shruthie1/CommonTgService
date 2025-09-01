type ShouldRetry = (error: any, attempt: number) => boolean;
interface WithTimeoutOptions {
    timeout?: number;
    timeLimit?: number;
    errorMessage?: string;
    throwErr?: boolean;
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: ShouldRetry;
    cancelSignal?: AbortSignal;
    onTimeout?: (error: any, attempts: number) => Promise<void>;
}
export declare function withTimeout<T>(promiseFactory: () => Promise<T>, options?: WithTimeoutOptions): Promise<T>;
export {};

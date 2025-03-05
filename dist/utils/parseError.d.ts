export declare const extractMessage: (data: any) => string;
export declare function parseError(err: any, prefix?: string, sendErr?: boolean): {
    status: number;
    message: string;
    error: any;
};

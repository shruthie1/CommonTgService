export declare class FileMetadataResponse {
    filename: string;
    size: number;
    createdAt: Date;
    modifiedAt: Date;
}
export declare class FolderResponse {
    folders: string[];
}
export declare class FolderDetailsResponse {
    folder: string;
    files: string[];
    totalFiles: number;
    page: number;
    limit: number;
}
export declare class ShareableLinkResponse {
    shareableLink: string;
}
export declare class FileVersionResponse {
    filename: string;
    versions: Array<{
        version: string;
        filename: string;
    }>;
}
export declare class FolderTreeResponse {
    name: string;
    children: Array<{
        name: string;
        children?: any[];
    }>;
}
export declare class ErrorResponse {
    statusCode: number;
    message: string;
    error: string;
}
export declare class JsonFileResponse {
    content: any;
}
export declare class JsonValueResponse {
    value: any;
}
export declare class FileOperationMetricDto {
    operation: string;
    success: boolean;
    duration: number;
    timestamp: number;
    path?: string;
    error?: string;
}
export declare class FileOperationMetricsResponse {
    metrics: FileOperationMetricDto[];
    failureRate: number;
    timeWindow: number;
    totalOperations: number;
}

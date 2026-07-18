export declare class FileOperationError extends Error {
    readonly code: string;
    readonly operation: string;
    readonly details?: any;
    constructor(message: string, code: string, operation: string, details?: any);
}
export declare const FileErrorCodes: {
    readonly FILE_NOT_FOUND: "FILE_NOT_FOUND";
    readonly INVALID_PATH: "INVALID_PATH";
    readonly ACCESS_DENIED: "ACCESS_DENIED";
    readonly INVALID_OPERATION: "INVALID_OPERATION";
    readonly STORAGE_FULL: "STORAGE_FULL";
    readonly FILE_TOO_LARGE: "FILE_TOO_LARGE";
    readonly INVALID_FILE_TYPE: "INVALID_FILE_TYPE";
    readonly FOLDER_EXISTS: "FOLDER_EXISTS";
    readonly FILE_EXISTS: "FILE_EXISTS";
    readonly FOLDER_NOT_EMPTY: "FOLDER_NOT_EMPTY";
};

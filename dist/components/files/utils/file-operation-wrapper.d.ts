import { FileOperationError } from './file-operation-error';
export declare class FileOperationResult<T> {
    readonly success: boolean;
    readonly data?: T;
    readonly error?: FileOperationError;
    constructor(success: boolean, data?: T, error?: FileOperationError);
    static success<T>(data?: T): FileOperationResult<T>;
    static failure<T>(error: FileOperationError): FileOperationResult<T>;
}
declare function withFileOperation<T>(operation: string, action: () => Promise<T> | T, path?: string): Promise<FileOperationResult<T>>;
export { withFileOperation };

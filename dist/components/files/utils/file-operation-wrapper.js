"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOperationResult = void 0;
exports.withFileOperation = withFileOperation;
const file_operation_error_1 = require("./file-operation-error");
const file_operation_monitor_1 = require("./file-operation-monitor");
class FileOperationResult {
    constructor(success, data, error) {
        this.success = success;
        this.data = data;
        this.error = error;
    }
    static success(data) {
        return new FileOperationResult(true, data);
    }
    static failure(error) {
        return new FileOperationResult(false, undefined, error);
    }
}
exports.FileOperationResult = FileOperationResult;
async function withFileOperation(operation, action, path) {
    const startTime = Date.now();
    try {
        const result = await action();
        file_operation_monitor_1.FileOperationMonitor.recordOperation({
            operation,
            success: true,
            duration: Date.now() - startTime,
            timestamp: startTime,
            path,
        });
        return FileOperationResult.success(result);
    }
    catch (error) {
        const duration = Date.now() - startTime;
        file_operation_monitor_1.FileOperationMonitor.recordOperation({
            operation,
            success: false,
            duration,
            timestamp: startTime,
            path,
            error: error.message,
        });
        if (error instanceof file_operation_error_1.FileOperationError) {
            return FileOperationResult.failure(error);
        }
        let fileError;
        if (error.code === 'ENOENT') {
            fileError = new file_operation_error_1.FileOperationError('File or directory not found', file_operation_error_1.FileErrorCodes.FILE_NOT_FOUND, operation);
        }
        else if (error.code === 'EACCES') {
            fileError = new file_operation_error_1.FileOperationError('Access denied', file_operation_error_1.FileErrorCodes.ACCESS_DENIED, operation);
        }
        else if (error.code === 'EEXIST') {
            fileError = new file_operation_error_1.FileOperationError('File or folder already exists', file_operation_error_1.FileErrorCodes.FILE_EXISTS, operation);
        }
        else if (error.code === 'ENOSPC') {
            fileError = new file_operation_error_1.FileOperationError('No space left on storage', file_operation_error_1.FileErrorCodes.STORAGE_FULL, operation);
        }
        else {
            fileError = new file_operation_error_1.FileOperationError(error.message || 'Unknown error occurred', file_operation_error_1.FileErrorCodes.INVALID_OPERATION, operation, error);
        }
        return FileOperationResult.failure(fileError);
    }
}
//# sourceMappingURL=file-operation-wrapper.js.map
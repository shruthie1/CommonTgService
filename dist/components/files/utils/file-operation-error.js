"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileErrorCodes = exports.FileOperationError = void 0;
class FileOperationError extends Error {
    constructor(message, code, operation, details) {
        super(message);
        this.code = code;
        this.operation = operation;
        this.details = details;
        this.name = 'FileOperationError';
    }
}
exports.FileOperationError = FileOperationError;
exports.FileErrorCodes = {
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    INVALID_PATH: 'INVALID_PATH',
    ACCESS_DENIED: 'ACCESS_DENIED',
    INVALID_OPERATION: 'INVALID_OPERATION',
    STORAGE_FULL: 'STORAGE_FULL',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    FOLDER_EXISTS: 'FOLDER_EXISTS',
    FILE_EXISTS: 'FILE_EXISTS',
    FOLDER_NOT_EMPTY: 'FOLDER_NOT_EMPTY',
};
//# sourceMappingURL=file-operation-error.js.map
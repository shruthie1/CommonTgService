// Detailed error types for file operations
export class FileOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'FileOperationError';
  }
}

export const FileErrorCodes = {
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
} as const;

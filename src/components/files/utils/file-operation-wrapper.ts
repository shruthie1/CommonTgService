import { FileOperationError, FileErrorCodes } from './file-operation-error';
import { FileOperationMonitor } from './file-operation-monitor';

export class FileOperationResult<T> {
  constructor(
    public readonly success: boolean,
    public readonly data?: T,
    public readonly error?: FileOperationError,
  ) {}

  static success<T>(data?: T): FileOperationResult<T> {
    return new FileOperationResult(true, data);
  }

  static failure<T>(error: FileOperationError): FileOperationResult<T> {
    return new FileOperationResult(false, undefined, error);
  }
}

async function withFileOperation<T>(
  operation: string,
  action: () => Promise<T> | T,
  path?: string,
): Promise<FileOperationResult<T>> {
  const startTime = Date.now();
  try {
    const result = await action();
    FileOperationMonitor.recordOperation({
      operation,
      success: true,
      duration: Date.now() - startTime,
      timestamp: startTime,
      path,
    });
    return FileOperationResult.success(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    FileOperationMonitor.recordOperation({
      operation,
      success: false,
      duration,
      timestamp: startTime,
      path,
      error: error.message,
    });

    if (error instanceof FileOperationError) {
      return FileOperationResult.failure(error);
    }

    let fileError: FileOperationError;
    if (error.code === 'ENOENT') {
      fileError = new FileOperationError(
        'File or directory not found',
        FileErrorCodes.FILE_NOT_FOUND,
        operation,
      );
    } else if (error.code === 'EACCES') {
      fileError = new FileOperationError(
        'Access denied',
        FileErrorCodes.ACCESS_DENIED,
        operation,
      );
    } else if (error.code === 'EEXIST') {
      fileError = new FileOperationError(
        'File or folder already exists',
        FileErrorCodes.FILE_EXISTS,
        operation,
      );
    } else if (error.code === 'ENOSPC') {
      fileError = new FileOperationError(
        'No space left on storage',
        FileErrorCodes.STORAGE_FULL,
        operation,
      );
    } else {
      fileError = new FileOperationError(
        error.message || 'Unknown error occurred',
        FileErrorCodes.INVALID_OPERATION,
        operation,
        error,
      );
    }
    return FileOperationResult.failure(fileError);
  }
}

export { withFileOperation };

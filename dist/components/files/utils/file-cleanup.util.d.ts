export declare class FileCleanupUtil {
    private static readonly TEMP_FILE_PATTERN;
    private static readonly MAX_TEMP_AGE;
    static cleanupTempFiles(directory: string): Promise<void>;
    static cleanupEmptyFolders(directory: string): Promise<void>;
}

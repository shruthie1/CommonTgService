import { join } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

export class FileCleanupUtil {
  private static readonly TEMP_FILE_PATTERN = /\.temp\./;
  private static readonly MAX_TEMP_AGE = 24 * 60 * 60 * 1000; // 24 hours

  static async cleanupTempFiles(directory: string): Promise<void> {
    try {
      const files = await readdirAsync(directory);
      const now = Date.now();

      for (const file of files) {
        const filePath = join(directory, file);
        try {
          const stats = await statAsync(filePath);

          if (
            FileCleanupUtil.TEMP_FILE_PATTERN.test(file) &&
            now - stats.mtimeMs > FileCleanupUtil.MAX_TEMP_AGE
          ) {
            await unlinkAsync(filePath);
          }
        } catch (err) {
          console.error(`Error processing file ${file}:`, err);
        }
      }
    } catch (err) {
      console.error('Error cleaning up temp files:', err);
    }
  }

  static async cleanupEmptyFolders(directory: string): Promise<void> {
    try {
      const files = await readdirAsync(directory);

      for (const file of files) {
        const filePath = join(directory, file);
        try {
          const stats = await statAsync(filePath);

          if (stats.isDirectory()) {
            await FileCleanupUtil.cleanupEmptyFolders(filePath);

            const remainingFiles = await readdirAsync(filePath);
            if (remainingFiles.length === 0) {
              await fs.promises.rmdir(filePath);
            }
          }
        } catch (err) {
          console.error(`Error processing path ${file}:`, err);
        }
      }
    } catch (err) {
      console.error('Error cleaning up empty folders:', err);
    }
  }
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileCleanupUtil = void 0;
const path_1 = require("path");
const fs = __importStar(require("fs"));
const util_1 = require("util");
const unlinkAsync = (0, util_1.promisify)(fs.unlink);
const readdirAsync = (0, util_1.promisify)(fs.readdir);
const statAsync = (0, util_1.promisify)(fs.stat);
class FileCleanupUtil {
    static async cleanupTempFiles(directory) {
        try {
            const files = await readdirAsync(directory);
            const now = Date.now();
            for (const file of files) {
                const filePath = (0, path_1.join)(directory, file);
                try {
                    const stats = await statAsync(filePath);
                    if (FileCleanupUtil.TEMP_FILE_PATTERN.test(file) &&
                        now - stats.mtimeMs > FileCleanupUtil.MAX_TEMP_AGE) {
                        await unlinkAsync(filePath);
                    }
                }
                catch (err) {
                    console.error(`Error processing file ${file}:`, err);
                }
            }
        }
        catch (err) {
            console.error('Error cleaning up temp files:', err);
        }
    }
    static async cleanupEmptyFolders(directory) {
        try {
            const files = await readdirAsync(directory);
            for (const file of files) {
                const filePath = (0, path_1.join)(directory, file);
                try {
                    const stats = await statAsync(filePath);
                    if (stats.isDirectory()) {
                        await FileCleanupUtil.cleanupEmptyFolders(filePath);
                        const remainingFiles = await readdirAsync(filePath);
                        if (remainingFiles.length === 0) {
                            await fs.promises.rmdir(filePath);
                        }
                    }
                }
                catch (err) {
                    console.error(`Error processing path ${file}:`, err);
                }
            }
        }
        catch (err) {
            console.error('Error cleaning up empty folders:', err);
        }
    }
}
exports.FileCleanupUtil = FileCleanupUtil;
FileCleanupUtil.TEMP_FILE_PATTERN = /\.temp\./;
FileCleanupUtil.MAX_TEMP_AGE = 24 * 60 * 60 * 1000;
//# sourceMappingURL=file-cleanup.util.js.map
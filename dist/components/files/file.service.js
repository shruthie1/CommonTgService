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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var FileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const common_1 = require("@nestjs/common");
const path_1 = __importStar(require("path"));
const fs = __importStar(require("fs"));
const archiver_1 = __importDefault(require("archiver"));
const axios_1 = __importDefault(require("axios"));
const file_config_1 = require("./config/file.config");
const view_config_1 = require("./config/view.config");
const fs_1 = require("fs");
const mime_types_1 = require("mime-types");
const json_path_validator_1 = require("./utils/json-path.validator");
const file_operation_error_1 = require("./utils/file-operation-error");
const file_operation_wrapper_1 = require("./utils/file-operation-wrapper");
const file_module_interface_1 = require("./file.module.interface");
const mime_1 = __importDefault(require("mime"));
const stream_1 = require("stream");
const util_1 = require("util");
const helper_1 = require("./utils/helper");
const streamPipeline = (0, util_1.promisify)(stream_1.pipeline);
let FileService = FileService_1 = class FileService {
    constructor(options) {
        this.options = options;
        this.logger = new common_1.Logger(FileService_1.name);
        this.config = {
            storagePath: options?.storagePath || file_config_1.FILE_CONFIG.STORAGE_PATH,
            maxFileSize: options?.maxFileSize || file_config_1.FILE_CONFIG.MAX_FILE_SIZE,
            allowedFileTypes: options?.allowedFileTypes || file_config_1.FILE_CONFIG.ALLOWED_FILE_TYPES,
        };
        this.logger.log(`FileService initialized with storage path: ${this.config.storagePath}`);
    }
    getSafePath(...segments) {
        const filePath = (0, path_1.join)(...segments);
        const resolvedPath = (0, path_1.resolve)(filePath);
        const basePath = (0, path_1.resolve)(this.config.storagePath);
        if (!resolvedPath.startsWith(basePath + path_1.sep)) {
            throw new Error(`Invalid or unsafe path access detected: ${resolvedPath}`);
        }
        return resolvedPath;
    }
    validateFileType(file) {
        return this.config.allowedFileTypes.includes(file.mimetype);
    }
    validateFileSize(file) {
        return file.size <= this.config.maxFileSize;
    }
    async listFolders() {
        const result = await (0, file_operation_wrapper_1.withFileOperation)('listFolders', async () => {
            if (!fs.existsSync(this.config.storagePath)) {
                fs.mkdirSync(this.config.storagePath, { recursive: true });
            }
            const folders = fs
                .readdirSync(this.config.storagePath, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);
            return { folders };
        });
        if (!result.success) {
            this.logger.error(`Failed to list folders: ${result.error.message}`);
            throw new common_1.InternalServerErrorException('Failed to list folders');
        }
        return result.data;
    }
    async getFolderDetails(folder, page = 1, limit = 10) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        const files = fs.readdirSync(folderPath);
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedFiles = files.slice(startIndex, endIndex);
        return {
            folder,
            files: paginatedFiles,
            totalFiles: files.length,
            page,
            limit,
        };
    }
    async createFolder(folderName) {
        const result = await (0, file_operation_wrapper_1.withFileOperation)('createFolder', async () => {
            const folderPath = this.getSafePath(this.config.storagePath, folderName);
            if (fs.existsSync(folderPath)) {
                throw new file_operation_error_1.FileOperationError('Folder already exists', file_operation_error_1.FileErrorCodes.FOLDER_EXISTS, 'createFolder', { folderName });
            }
            fs.mkdirSync(folderPath, { recursive: true });
            return { message: 'Folder created successfully', folder: folderName };
        });
        if (!result.success) {
            if (result.error.code === file_operation_error_1.FileErrorCodes.FOLDER_EXISTS) {
                throw new common_1.BadRequestException(result.error.message);
            }
            this.logger.error(`Failed to create folder: ${result.error.message}`);
            throw new common_1.InternalServerErrorException('Failed to create folder');
        }
        return result.data;
    }
    async deleteFolder(folder) {
        const result = await (0, file_operation_wrapper_1.withFileOperation)('deleteFolder', async () => {
            const folderPath = this.getSafePath(this.config.storagePath, folder);
            if (!fs.existsSync(folderPath)) {
                throw new file_operation_error_1.FileOperationError('Folder not found', file_operation_error_1.FileErrorCodes.FILE_NOT_FOUND, 'deleteFolder', { folder });
            }
            const files = fs.readdirSync(folderPath);
            if (files.length > 0) {
                throw new file_operation_error_1.FileOperationError('Cannot delete non-empty folder', file_operation_error_1.FileErrorCodes.FOLDER_NOT_EMPTY, 'deleteFolder', { folder, fileCount: files.length });
            }
            fs.rmdirSync(folderPath);
            return { message: 'Folder deleted successfully' };
        });
        if (!result.success) {
            if (result.error.code === file_operation_error_1.FileErrorCodes.FILE_NOT_FOUND) {
                throw new common_1.NotFoundException(result.error.message);
            }
            if (result.error.code === file_operation_error_1.FileErrorCodes.FOLDER_NOT_EMPTY) {
                throw new common_1.BadRequestException(result.error.message);
            }
            this.logger.error(`Failed to delete folder: ${result.error.message}`);
            throw new common_1.InternalServerErrorException('Failed to delete folder');
        }
        return result.data;
    }
    getDestination(req, file, cb) {
        try {
            const folderPath = this.getSafePath(this.config.storagePath, req.params.folder);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            cb(null, folderPath);
        }
        catch (error) {
            cb(error, null);
        }
    }
    getFilename(req, file, cb) {
        try {
            const extension = file.originalname.substring(file.originalname.lastIndexOf('.'));
            const baseFilename = req.query.filename || 'uploaded_file';
            const files = req.files;
            let finalFilename;
            if (files.length === 1) {
                finalFilename = `${baseFilename}${extension}`;
            }
            else {
                if (!req._fileCounter) {
                    req._fileCounter = 0;
                }
                req._fileCounter++;
                finalFilename = `${baseFilename}${req._fileCounter}${extension}`;
            }
            cb(null, finalFilename);
        }
        catch (error) {
            cb(error, null);
        }
    }
    uploadFiles(folder, files) {
        if (!files || files.length === 0) {
            this.logger.error(`No files provided for folder ${folder}`);
            throw new common_1.BadRequestException('File upload failed: No files provided');
        }
        const uploadedFiles = files.map((file) => {
            if (!this.validateFileType(file)) {
                this.logger.error(`Invalid file type: ${file.mimetype} for ${file.originalname}`);
                throw new common_1.BadRequestException(`Invalid file type for ${file.originalname}`);
            }
            if (!this.validateFileSize(file)) {
                this.logger.error(`File size exceeds limit: ${file.size} bytes`);
                throw new common_1.BadRequestException(`File size exceeds limit for ${file.originalname}`);
            }
            this.logger.log(`File uploaded: ${file.filename} to folder: ${folder}`);
            return { filename: file.filename };
        });
        return { message: 'Files uploaded successfully', files: uploadedFiles };
    }
    downloadFile(folder, filename, res) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const stats = fs.statSync(filePath);
        const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        res.set({
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'ETag': etag,
            'Last-Modified': stats.mtime.toUTCString(),
        });
        return res.download(filePath);
    }
    async getFileMetadata(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        try {
            const stats = fs.statSync(filePath);
            return {
                filename,
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
            };
        }
        catch (error) {
            this.logger.error(`Error retrieving metadata for ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error retrieving file metadata');
        }
    }
    moveFile(folder, filename, body) {
        const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
        const newFolder = body.newFolder || folder;
        const newFilename = body.newFilename || filename;
        const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
        if (!fs.existsSync(newFolderPath)) {
            try {
                fs.mkdirSync(newFolderPath, { recursive: true });
                this.logger.log(`Created destination folder: ${newFolder}`);
            }
            catch (error) {
                this.logger.error(`Error creating folder ${newFolder}: ${error.message}`);
                throw new common_1.InternalServerErrorException('Failed to create destination folder');
            }
        }
        const newPath = this.getSafePath(newFolderPath, newFilename);
        if (fs.existsSync(newPath)) {
            this.logger.error(`File already exists at destination: ${newPath}`);
            throw new common_1.BadRequestException('File already exists at destination');
        }
        try {
            fs.renameSync(oldPath, newPath);
            this.logger.log(`File moved from ${oldPath} to ${newPath}`);
            return { message: 'File moved/renamed successfully', newPath };
        }
        catch (error) {
            this.logger.error(`Error moving file: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error moving file');
        }
    }
    copyFile(folder, filename, body) {
        const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
        const newFolder = body.newFolder || folder;
        const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
        if (!fs.existsSync(oldPath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        if (!fs.existsSync(newFolderPath)) {
            try {
                fs.mkdirSync(newFolderPath, { recursive: true });
                this.logger.log(`Created destination folder: ${newFolder}`);
            }
            catch (error) {
                this.logger.error(`Error creating folder ${newFolder}: ${error.message}`);
                throw new common_1.InternalServerErrorException('Failed to create destination folder');
            }
        }
        const newPath = this.getSafePath(newFolderPath, filename);
        try {
            fs.copyFileSync(oldPath, newPath);
            this.logger.log(`File copied from ${oldPath} to ${newPath}`);
            return { message: 'File copied successfully', newPath };
        }
        catch (error) {
            this.logger.error(`Error copying file: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error copying file');
        }
    }
    async downloadAllFiles(folder, res) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        const files = fs.readdirSync(folderPath);
        if (files.length === 0) {
            this.logger.warn(`No files found in folder: ${folder}`);
            throw new common_1.BadRequestException('No files available in this folder');
        }
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        res.attachment(`${folder}.zip`);
        archive.pipe(res);
        files.forEach((file) => {
            try {
                const filePath = this.getSafePath(folderPath, file);
                archive.file(filePath, { name: file });
            }
            catch (error) {
                this.logger.error(`Error adding file ${file} to ZIP: ${error.message}`);
            }
        });
        try {
            await archive.finalize();
            this.logger.log(`ZIP archive generated for folder: ${folder}`);
        }
        catch (error) {
            this.logger.error(`Error finalizing ZIP: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error generating ZIP archive');
        }
    }
    getTemporaryLinks(folder) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        const files = fs.readdirSync(folderPath);
        if (files.length === 0) {
            this.logger.warn(`No files found in folder: ${folder}`);
            throw new common_1.BadRequestException('No files available in this folder');
        }
        const fileLinks = files.map((file) => ({
            filename: file,
            url: `${process.env.serviceUrl}/folders/${folder}/files/${file}?temp=true`,
        }));
        return { folder, fileLinks };
    }
    getTemporaryFileLink(folder, filename) {
        return {
            url: `${process.env.serviceUrl}/folders/${folder}/files/${filename}?temp=true`,
        };
    }
    searchFiles(folder, pattern) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        let regex;
        try {
            regex = new RegExp(pattern, 'i');
        }
        catch (error) {
            console.log('error', error);
            this.logger.error(`Invalid regex: ${pattern}`);
            throw new common_1.BadRequestException('Invalid regular expression');
        }
        const files = fs.readdirSync(folderPath);
        const matchingFiles = files.filter((file) => regex.test(file));
        return { folder, pattern, matchingFiles };
    }
    async getJsonFile(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, `${filename}.json`);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`JSON file not found: ${filename}.json in folder ${folder}`);
            throw new common_1.NotFoundException('JSON file not found');
        }
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return { content: JSON.parse(fileContent) };
        }
        catch (error) {
            this.logger.error(`Error parsing JSON file ${filename}.json: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error parsing JSON file');
        }
    }
    async getNestedJsonValue(folder, filename, pathParams) {
        const wildcardPath = pathParams['path'][0] || '';
        const keys = wildcardPath.split('/').filter((key) => key !== '');
        try {
            json_path_validator_1.JsonPathValidator.validate(keys);
            const filePath = this.getSafePath(this.config.storagePath, folder, `${filename}.json`);
            if (!fs.existsSync(filePath)) {
                this.logger.error(`JSON file not found: ${filename}.json in folder ${folder}`);
                throw new common_1.NotFoundException('JSON file not found');
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            let result = JSON.parse(fileContent);
            for (const key of keys) {
                if (result[key] === undefined) {
                    this.logger.error(`Key '${key}' not found in ${filename}.json`);
                    throw new common_1.BadRequestException(`Key '${key}' not found`);
                }
                result = result[key];
            }
            return { value: result };
        }
        catch (error) {
            if (error instanceof json_path_validator_1.JsonPathValidationError) {
                throw new common_1.BadRequestException(error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.error(`Error processing JSON file ${filename}.json: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error processing JSON file');
        }
    }
    async queryJsonFile(folder, filename, query) {
        try {
            json_path_validator_1.JsonPathValidator.validateJsonQuery(query);
            const filePath = this.getSafePath(this.config.storagePath, folder, `${filename}.json`);
            if (!fs.existsSync(filePath)) {
                this.logger.error(`JSON file not found: ${filename}.json in folder ${folder}`);
                throw new common_1.NotFoundException('JSON file not found');
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const jsonData = JSON.parse(fileContent);
            const segments = query.split('.');
            let result = jsonData;
            for (const segment of segments) {
                const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
                if (arrayMatch) {
                    const [, key, index] = arrayMatch;
                    result = result[key]?.[parseInt(index, 10)];
                }
                else {
                    result = result[segment];
                }
                if (result === undefined) {
                    throw new common_1.BadRequestException(`Path '${query}' not found in JSON`);
                }
            }
            return { value: result };
        }
        catch (error) {
            if (error instanceof json_path_validator_1.JsonPathValidationError ||
                error instanceof common_1.BadRequestException) {
                throw new common_1.BadRequestException(error.message);
            }
            this.logger.error(`Error querying JSON file ${filename}.json: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error processing JSON file');
        }
    }
    deleteFile(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        try {
            fs.rmSync(filePath);
            this.logger.log(`File deleted successfully: ${filename} from folder: ${folder}`);
            return { message: 'File deleted successfully' };
        }
        catch (error) {
            this.logger.error(`Error deleting file ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error deleting file');
        }
    }
    updateFileMetadata(folder, filename, body) {
        const oldPath = this.getSafePath(this.config.storagePath, folder, filename);
        const newFolder = body.newFolder || folder;
        const newFilename = body.newFilename || filename;
        const newFolderPath = this.getSafePath(this.config.storagePath, newFolder);
        if (!fs.existsSync(newFolderPath)) {
            try {
                fs.mkdirSync(newFolderPath, { recursive: true });
                this.logger.log(`Created destination folder: ${newFolder}`);
            }
            catch (error) {
                this.logger.error(`Error creating folder ${newFolder}: ${error.message}`);
                throw new common_1.InternalServerErrorException('Failed to create destination folder');
            }
        }
        const newPath = this.getSafePath(newFolderPath, newFilename);
        if (fs.existsSync(newPath)) {
            this.logger.error(`File already exists at destination: ${newPath}`);
            throw new common_1.BadRequestException('File already exists at destination');
        }
        try {
            fs.renameSync(oldPath, newPath);
            this.logger.log(`File metadata updated from ${oldPath} to ${newPath}`);
            return { message: 'File metadata updated successfully', newPath };
        }
        catch (error) {
            this.logger.error(`Error updating file metadata: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error updating file metadata');
        }
    }
    getFolderSize(folder) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        const getSize = (dirPath) => {
            const files = fs.readdirSync(dirPath);
            return files.reduce((total, file) => {
                const filePath = this.getSafePath(dirPath, file);
                const stats = fs.statSync(filePath);
                return total + (stats.isDirectory() ? getSize(filePath) : stats.size);
            }, 0);
        };
        const size = getSize(folderPath);
        return { folder, size };
    }
    listFiles(folder) {
        const folderPath = this.getSafePath(this.config.storagePath, folder);
        if (!fs.existsSync(folderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        const files = fs.readdirSync(folderPath);
        return { folder, files };
    }
    getFile(folder, filename, res) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const stats = fs.statSync(filePath);
        const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        res.set({
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'ETag': etag,
            'Last-Modified': stats.mtime.toUTCString(),
        });
        return res.sendFile(filePath);
    }
    renameFolder(folder, newFolderName) {
        const oldFolderPath = this.getSafePath(this.config.storagePath, folder);
        const newFolderPath = this.getSafePath(this.config.storagePath, newFolderName);
        if (!fs.existsSync(oldFolderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        if (fs.existsSync(newFolderPath)) {
            this.logger.error(`Folder already exists: ${newFolderName}`);
            throw new common_1.BadRequestException('Folder already exists');
        }
        try {
            fs.renameSync(oldFolderPath, newFolderPath);
            this.logger.log(`Folder renamed from ${folder} to ${newFolderName}`);
            return { message: 'Folder renamed successfully', newFolderName };
        }
        catch (error) {
            this.logger.error(`Error renaming folder ${folder}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error renaming folder');
        }
    }
    moveFolder(folder, newLocation) {
        const oldFolderPath = this.getSafePath(this.config.storagePath, folder);
        const newFolderPath = this.getSafePath(this.config.storagePath, newLocation, folder);
        if (!fs.existsSync(oldFolderPath)) {
            this.logger.error(`Folder not found: ${folder}`);
            throw new common_1.NotFoundException('Folder not found');
        }
        if (fs.existsSync(newFolderPath)) {
            this.logger.error(`Folder already exists at destination: ${newFolderPath}`);
            throw new common_1.BadRequestException('Folder already exists at destination');
        }
        try {
            fs.renameSync(oldFolderPath, newFolderPath);
            this.logger.log(`Folder moved from ${oldFolderPath} to ${newFolderPath}`);
            return { message: 'Folder moved successfully', newFolderPath };
        }
        catch (error) {
            this.logger.error(`Error moving folder ${folder}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error moving folder');
        }
    }
    async getFilePreview(folder, filename, req, res) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const stats = fs.statSync(filePath);
        const mimeType = (0, mime_types_1.lookup)(filePath) || 'application/octet-stream';
        const etag = `"${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        if (stats.size > view_config_1.VIEW_CONFIG.PREVIEW_SIZE_LIMIT) {
            if (!this.isPreviewSupported(mimeType)) {
                throw new common_1.BadRequestException('Preview not available for this file type or size');
            }
        }
        res.set({
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'ETag': etag,
            'Last-Modified': stats.mtime.toUTCString(),
        });
        try {
            if (view_config_1.VIEW_CONFIG.IMAGE_TYPES.includes(mimeType)) {
                const thumbnail = fs.readFileSync(filePath);
                res.setHeader('Content-Type', mimeType);
                return res.send(thumbnail);
            }
            if (view_config_1.VIEW_CONFIG.VIDEO_TYPES.includes(mimeType) ||
                view_config_1.VIEW_CONFIG.AUDIO_TYPES.includes(mimeType)) {
                const range = req.headers.range;
                if (range) {
                    const parts = range.replace(/bytes=/, '').split('-');
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                    const chunkSize = end - start + 1;
                    const stream = fs.createReadStream(filePath, { start, end });
                    const headers = {
                        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunkSize,
                        'Content-Type': mimeType,
                    };
                    res.writeHead(206, headers);
                    return stream.pipe(res);
                }
                else {
                    const headers = {
                        'Content-Length': stats.size,
                        'Content-Type': mimeType,
                        'Accept-Ranges': 'bytes',
                    };
                    res.writeHead(200, headers);
                    return fs.createReadStream(filePath).pipe(res);
                }
            }
            if (view_config_1.VIEW_CONFIG.TEXT_TYPES.includes(mimeType)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const preview = content.substring(0, 1000) + (content.length > 1000 ? '...' : '');
                return { preview, mimeType };
            }
            if (view_config_1.VIEW_CONFIG.PDF_TYPES.includes(mimeType)) {
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Range', `bytes 0-${Math.min(stats.size, view_config_1.VIEW_CONFIG.PREVIEW_SIZE_LIMIT)}`);
                const stream = (0, fs_1.createReadStream)(filePath, {
                    start: 0,
                    end: view_config_1.VIEW_CONFIG.PREVIEW_SIZE_LIMIT - 1,
                });
                return stream.pipe(res);
            }
            throw new common_1.BadRequestException('Preview not available for this file type');
        }
        catch (error) {
            this.logger.error(`Error generating preview for ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error generating file preview');
        }
    }
    async getThumbnail(folder, filename, res) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const mimeType = (0, mime_types_1.lookup)(filePath) || 'application/octet-stream';
        const stats = fs.statSync(filePath);
        const etag = `"thumb-${stats.mtimeMs.toString(36)}-${stats.size.toString(36)}"`;
        res.set({
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'ETag': etag,
            'Last-Modified': stats.mtime.toUTCString(),
        });
        try {
            if (view_config_1.VIEW_CONFIG.IMAGE_TYPES.includes(mimeType)) {
                const thumbnail = fs.readFileSync(filePath);
                res.setHeader('Content-Type', 'image/jpeg');
                return res.send(thumbnail);
            }
            if (view_config_1.VIEW_CONFIG.VIDEO_TYPES.includes(mimeType)) {
                res.setHeader('Content-Type', 'image/jpeg');
                return res.send(undefined);
            }
            throw new common_1.BadRequestException('Thumbnail not available for this file type');
        }
        catch (error) {
            this.logger.error(`Error generating thumbnail for ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error generating thumbnail');
        }
    }
    isPreviewSupported(mimeType) {
        const supportedTypes = [
            ...view_config_1.VIEW_CONFIG.IMAGE_TYPES,
            ...view_config_1.VIEW_CONFIG.PDF_TYPES,
            ...view_config_1.VIEW_CONFIG.TEXT_TYPES,
            ...view_config_1.VIEW_CONFIG.AUDIO_TYPES,
            ...view_config_1.VIEW_CONFIG.VIDEO_TYPES,
        ];
        return supportedTypes.includes(mimeType);
    }
    async getFolderTree() {
        const buildTree = (dirPath) => {
            const name = dirPath.split('/').pop();
            const item = { name, children: [] };
            const files = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const file of files) {
                if (file.isDirectory()) {
                    item.children.push(buildTree((0, path_1.join)(dirPath, file.name)));
                }
                else {
                    item.children.push({ name: file.name });
                }
            }
            return item;
        };
        return buildTree(this.config.storagePath);
    }
    async generateShareableLink(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const shareableLink = `${process.env.serviceUrl}/folders/${folder}/files/${filename}?share=true`;
        return { shareableLink };
    }
    lockFile(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const lockFilePath = `${filePath}.lock`;
        if (fs.existsSync(lockFilePath)) {
            this.logger.error(`File is already locked: ${filename}`);
            throw new common_1.BadRequestException('File is already locked');
        }
        try {
            fs.writeFileSync(lockFilePath, '');
            this.logger.log(`File locked successfully: ${filename}`);
            return { message: 'File locked successfully' };
        }
        catch (error) {
            this.logger.error(`Error locking file ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error locking file');
        }
    }
    unlockFile(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const lockFilePath = `${filePath}.lock`;
        if (!fs.existsSync(lockFilePath)) {
            this.logger.error(`File is not locked: ${filename}`);
            throw new common_1.BadRequestException('File is not locked');
        }
        try {
            fs.rmSync(lockFilePath);
            this.logger.log(`File unlocked successfully: ${filename}`);
            return { message: 'File unlocked successfully' };
        }
        catch (error) {
            this.logger.error(`Error unlocking file ${filename}: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error unlocking file');
        }
    }
    getRecentFiles() {
        const getRecentFilesFromDir = (dirPath) => {
            const files = fs.readdirSync(dirPath, { withFileTypes: true });
            let recentFiles = [];
            for (const file of files) {
                const filePath = (0, path_1.join)(dirPath, file.name);
                if (file.isDirectory()) {
                    recentFiles = recentFiles.concat(getRecentFilesFromDir(filePath));
                }
                else {
                    const stats = fs.statSync(filePath);
                    recentFiles.push({ name: file.name, modifiedAt: stats.mtime });
                }
            }
            return recentFiles;
        };
        const recentFiles = getRecentFilesFromDir(this.config.storagePath);
        recentFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);
        return recentFiles.slice(0, 10);
    }
    async getFileVersions(folder, filename) {
        const filePath = this.getSafePath(this.config.storagePath, folder, filename);
        if (!fs.existsSync(filePath)) {
            this.logger.error(`File not found: ${filename} in folder: ${folder}`);
            throw new common_1.NotFoundException('File not found');
        }
        const versionFiles = fs
            .readdirSync(this.config.storagePath)
            .filter((file) => file.startsWith(`${filename}.v`))
            .map((file) => ({ version: file.split('.v')[1], filename: file }));
        return { filename, versions: versionFiles };
    }
    onModuleInit() {
        const thumbnailsPath = this.getSafePath(this.config.storagePath, '.thumbnails');
        if (!fs.existsSync(thumbnailsPath)) {
            fs.mkdirSync(thumbnailsPath, { recursive: true });
        }
    }
    async copyFolder(sourceFolder, destinationFolder) {
        const sourcePath = this.getSafePath(this.config.storagePath, sourceFolder);
        const destPath = this.getSafePath(this.config.storagePath, destinationFolder);
        if (!fs.existsSync(sourcePath)) {
            this.logger.error(`Source folder not found: ${sourceFolder}`);
            throw new common_1.NotFoundException('Source folder not found');
        }
        if (fs.existsSync(destPath)) {
            this.logger.error(`Destination folder already exists: ${destinationFolder}`);
            throw new common_1.BadRequestException('Destination folder already exists');
        }
        try {
            fs.mkdirSync(destPath, { recursive: true });
            const copyRecursive = (src, dest) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (const entry of entries) {
                    const srcPath = (0, path_1.join)(src, entry.name);
                    const destPath = (0, path_1.join)(dest, entry.name);
                    if (entry.isDirectory()) {
                        fs.mkdirSync(destPath, { recursive: true });
                        copyRecursive(srcPath, destPath);
                    }
                    else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            };
            copyRecursive(sourcePath, destPath);
            this.logger.log(`Folder copied from ${sourcePath} to ${destPath}`);
            return {
                message: 'Folder copied successfully',
                sourceFolder,
                destinationFolder,
            };
        }
        catch (error) {
            this.logger.error(`Error copying folder: ${error.message}`);
            throw new common_1.InternalServerErrorException('Error copying folder');
        }
    }
    async stream(filename, folder, req, res) {
        const requestId = req.headers['x-request-id'] ||
            `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        try {
            const filePath = this.getSafePath(this.config.storagePath, folder, filename);
            if (!fs.existsSync(filePath)) {
                this.logger.warn(`[${requestId}] ❌ File not found: ${filePath}`);
                return res.status(404).json({ error: 'File not found' });
            }
            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile() || stat.size === 0) {
                this.logger.warn(`[${requestId}] ❌ Invalid file`);
                return res.status(400).json({ error: 'Invalid file' });
            }
            const mimeType = mime_1.default.lookup(filePath) || 'application/octet-stream';
            const fileSize = stat.size;
            const rangeHeader = req.headers.range;
            const etag = `"${stat.mtime.getTime()}-${stat.size}"`;
            const lastModified = stat.mtime.toUTCString();
            if (req.headers['if-none-match'] === etag) {
                return res.status(304).end();
            }
            if (req.headers['if-modified-since']) {
                const clientDate = new Date(req.headers['if-modified-since']);
                if (clientDate >= new Date(stat.mtime.getTime() - 1000)) {
                    return res.status(304).end();
                }
            }
            let start = 0;
            let end = fileSize - 1;
            let statusCode = 200;
            if (rangeHeader) {
                const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
                if (match) {
                    start = match[1] ? parseInt(match[1]) : 0;
                    end = match[2] ? parseInt(match[2]) : fileSize - 1;
                    const MAX_CHUNK = 1024 * 1024;
                    if (!match[2] && end > start + MAX_CHUNK - 1) {
                        end = start + MAX_CHUNK - 1;
                    }
                    if (start >= fileSize || end >= fileSize || start > end) {
                        return res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).json({ error: 'Range not satisfiable' });
                    }
                    statusCode = 206;
                }
            }
            const contentLength = end - start + 1;
            this.logger.log(`[${requestId}] 📤 Streaming ${filename} [${start}-${end}] (${(contentLength / 1024 / 1024).toFixed(2)} MB)`);
            res.writeHead(statusCode, {
                'Content-Type': mimeType,
                'Content-Length': contentLength.toString(),
                'Accept-Ranges': 'bytes',
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'ETag': etag,
                'Last-Modified': lastModified,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Content-Type',
            });
            const stream = fs.createReadStream(filePath, {
                start,
                end,
                highWaterMark: 1024 * 1024,
            });
            stream.pipe(res);
            stream.on('end', () => {
            });
            stream.on('error', (err) => {
                this.logger.error(`[${requestId}] ❌ Stream error:`, err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error' });
                }
                else {
                    res.destroy();
                }
            });
            req.on('close', () => {
                stream.destroy();
            });
        }
        catch (error) {
            this.logger.error(`[${requestId}] ❌ Fatal error:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            }
            else {
                res.destroy();
            }
        }
    }
    async uploadFromUrl(files, folderName) {
        const results = [];
        const uploadPath = this.getSafePath(this.config.storagePath, folderName);
        let index = 0;
        for (const [key, url] of Object.entries(files)) {
            index++;
            this.logger.log(`⬇️[${index} / ${Object.keys(files).length}] Starting download: ${key} `);
            try {
                const head = await axios_1.default.head(url);
                const contentTypeHeader = head.headers['content-type'];
                const contentType = typeof contentTypeHeader === 'string' ? contentTypeHeader : '';
                const ext = (0, helper_1.getFileExtension)(contentType, url);
                const safeName = (0, helper_1.sanitizeFileName)(key);
                const finalFileName = `${safeName}.${ext} `;
                const filePath = path_1.default.resolve(uploadPath, finalFileName);
                if (fs.existsSync(filePath)) {
                    this.logger.log(`✅ Skipped(Already exists): ${finalFileName} `);
                    results.push({ file: finalFileName, status: 'skipped', reason: 'Already exists' });
                    continue;
                }
                fs.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
                const response = await axios_1.default.get(url, { responseType: 'stream' });
                await streamPipeline(response.data, fs.createWriteStream(filePath));
                this.logger.log(`🎉 Downloaded: ${finalFileName} `);
                results.push({ file: finalFileName, status: 'success' });
            }
            catch (err) {
                this.logger.warn(`⚠️ Failed to download ${key}: ${err.message} `);
                results.push({ file: key, status: 'failed', reason: err.message });
            }
        }
        this.logger.log(`📦 Download summary - Total: ${Object.keys(files).length}, Success: ${results.filter(r => r.status === 'success').length}, Skipped: ${results.filter(r => r.status === 'skipped').length}, Failed: ${results.filter(r => r.status === 'failed').length} `);
        return { results };
    }
};
exports.FileService = FileService;
exports.FileService = FileService = FileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(file_module_interface_1.FILE_MODULE_OPTIONS)),
    __metadata("design:paramtypes", [Object])
], FileService);
//# sourceMappingURL=file.service.js.map
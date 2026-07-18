"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FileController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const file_validators_1 = require("./utils/file-validators");
const file_config_1 = require("./config/file.config");
const file_service_1 = require("./file.service");
const swagger_1 = require("@nestjs/swagger");
const fs_1 = require("fs");
const path_1 = require("path");
const requests_dto_1 = require("./dto/requests.dto");
const responses_dto_1 = require("./dto/responses.dto");
const requests_dto_2 = require("./dto/requests.dto");
const file_operation_monitor_1 = require("./utils/file-operation-monitor");
const upload_by_url_dto_1 = require("./dto/upload-by-url.dto");
const MAX_FILE_SIZE = 1024 * 1024 * 100;
const UPLOADS_BASE = (0, path_1.join)(process.cwd(), 'uploads');
function getSafePath(...segments) {
    const filePath = (0, path_1.join)(...segments);
    const resolvedPath = (0, path_1.resolve)(filePath);
    const uploadsPath = (0, path_1.resolve)(UPLOADS_BASE);
    if (resolvedPath !== uploadsPath &&
        !resolvedPath.startsWith(`${uploadsPath}${path_1.sep}`)) {
        throw new Error(`Invalid path detected: ${resolvedPath}`);
    }
    return resolvedPath;
}
function safeUploadFilename(value) {
    const filename = (0, path_1.basename)(value);
    if (!filename ||
        filename === '.' ||
        filename === '..' ||
        filename !== value ||
        value.includes('\\') ||
        filename.includes('\0')) {
        throw new common_1.BadRequestException('Invalid upload filename');
    }
    return filename;
}
let FileController = FileController_1 = class FileController {
    constructor(fileService) {
        this.logger = new common_1.Logger(FileController_1.name);
        if (!fileService) {
            throw new Error('FileService is required');
        }
        this.fileService = fileService;
    }
    async uploadFiles(folder, files) {
        if (!files?.length) {
            throw new common_1.BadRequestException('No files provided');
        }
        return this.fileService.uploadFiles(folder, files);
    }
    listFolders() {
        return this.fileService.listFolders();
    }
    getFolderDetails(folder, page, limit) {
        return this.fileService.getFolderDetails(folder, page, limit);
    }
    async stream(file, folder, req, res) {
        return this.fileService.stream(file, folder, req, res);
    }
    async uploadFromUrl(body) {
        return this.fileService.uploadFromUrl(body.files, body.folder);
    }
    createFolder(createFolderDto) {
        return this.fileService.createFolder(createFolderDto.folderName);
    }
    deleteFolder(folder) {
        return this.fileService.deleteFolder(folder);
    }
    downloadFile(folder, filename, res) {
        return this.fileService.downloadFile(folder, filename, res);
    }
    getFileMetadata(folder, filename) {
        return this.fileService.getFileMetadata(folder, filename);
    }
    moveFile(folder, filename, moveFileDto) {
        return this.fileService.moveFile(folder, filename, moveFileDto);
    }
    copyFile(folder, filename, copyFileDto) {
        return this.fileService.copyFile(folder, filename, copyFileDto);
    }
    async downloadAllFiles(folder, res) {
        return this.fileService.downloadAllFiles(folder, res);
    }
    getTemporaryLinks(folder) {
        return this.fileService.getTemporaryLinks(folder);
    }
    getTemporaryFileLink(folder, filename) {
        return this.fileService.getTemporaryFileLink(folder, filename);
    }
    searchFiles(folder, pattern) {
        return this.fileService.searchFiles(folder, pattern);
    }
    getJsonFile(folder, filename) {
        return this.fileService.getJsonFile(folder, filename);
    }
    getNestedJsonValue(folder, filename, pathParams) {
        return this.fileService.getNestedJsonValue(folder, filename, pathParams);
    }
    queryJsonFile(folder, filename, query) {
        return this.fileService.queryJsonFile(folder, filename, query);
    }
    deleteFile(folder, filename) {
        return this.fileService.deleteFile(folder, filename);
    }
    updateFileMetadata(folder, filename, updateFileMetadataDto) {
        return this.fileService.updateFileMetadata(folder, filename, updateFileMetadataDto);
    }
    getFolderSize(folder) {
        return this.fileService.getFolderSize(folder);
    }
    listFiles(folder) {
        return this.fileService.listFiles(folder);
    }
    getThumbnail(folder, filename, res) {
        return this.fileService.getThumbnail(folder, filename, res);
    }
    getFile(folder, filename, res) {
        return this.fileService.getFile(folder, filename, res);
    }
    renameFolder(folder, renameFolderDto) {
        return this.fileService.renameFolder(folder, renameFolderDto.newFolderName);
    }
    moveFolder(folder, moveFolderDto) {
        return this.fileService.moveFolder(folder, moveFolderDto.newLocation);
    }
    getFilePreview(folder, filename, req, res) {
        return this.fileService.getFilePreview(folder, filename, req, res);
    }
    getFolderTree() {
        return this.fileService.getFolderTree();
    }
    generateShareableLink(folder, filename) {
        return this.fileService.generateShareableLink(folder, filename);
    }
    lockFile(folder, filename) {
        return this.fileService.lockFile(folder, filename);
    }
    unlockFile(folder, filename) {
        return this.fileService.unlockFile(folder, filename);
    }
    getRecentFiles() {
        return this.fileService.getRecentFiles();
    }
    getFileVersions(folder, filename) {
        return this.fileService.getFileVersions(folder, filename);
    }
    getFileOperationMetrics(timeWindow, limit) {
        const metrics = file_operation_monitor_1.FileOperationMonitor.getMetrics(limit);
        const failureRate = file_operation_monitor_1.FileOperationMonitor.getFailureRate(timeWindow);
        return {
            metrics,
            failureRate,
            timeWindow,
            totalOperations: metrics.length,
        };
    }
    async copyFolder(folder, destinationFolder) {
        return this.fileService.copyFolder(folder, destinationFolder);
    }
};
exports.FileController = FileController;
__decorate([
    (0, common_1.Post)('folders/:folder/files'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                try {
                    const folderName = req.params.folder;
                    const folderPath = getSafePath(UPLOADS_BASE, folderName);
                    if (!(0, fs_1.existsSync)(folderPath)) {
                        (0, fs_1.mkdirSync)(folderPath, { recursive: true });
                        console.log(`Created folder: ${folderPath}`);
                    }
                    cb(null, folderPath);
                }
                catch (error) {
                    console.error(`Error setting destination: ${error.message}`);
                    cb(error, null);
                }
            },
            filename: (req, file, cb) => {
                try {
                    const filenameQuery = req.query.filename;
                    const originalname = safeUploadFilename(file.originalname);
                    const extension = originalname.substring(originalname.lastIndexOf('.'));
                    if (!req.fileCounter) {
                        req.fileCounter = 0;
                    }
                    req.fileCounter++;
                    let finalFilename = originalname;
                    if (filenameQuery) {
                        const safeBaseName = safeUploadFilename(filenameQuery);
                        const currentCount = req.fileCounter;
                        finalFilename = `${safeBaseName}${currentCount}${extension}`;
                    }
                    console.log(`Saving file as: ${finalFilename}`);
                    cb(null, finalFilename);
                }
                catch (error) {
                    console.error(`Error setting filename: ${error.message}`);
                    cb(error, null);
                }
            },
        }),
        limits: { fileSize: MAX_FILE_SIZE },
    })),
    (0, swagger_1.ApiOperation)({
        summary: 'Upload files to a folder',
        description: 'Upload single or multiple files to a specified folder',
    }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['files'],
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Files to upload',
                },
            },
        },
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Target folder name' }),
    (0, swagger_1.ApiQuery)({
        name: 'filename',
        required: false,
        description: 'Optional custom filename for single file upload',
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.UploadedFiles)(new common_1.ParseFilePipe({
        validators: [
            new file_validators_1.CustomFileValidator({
                fileTypes: file_config_1.FILE_CONFIG.ALLOWED_FILE_TYPES,
            }),
            new file_validators_1.FileSizeValidator({ maxSize: file_config_1.FILE_CONFIG.MAX_FILE_SIZE }),
        ],
        errorHttpStatusCode: 400,
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadFiles", null);
__decorate([
    (0, common_1.Get)('folders'),
    (0, swagger_1.ApiOperation)({ summary: 'List all folders' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Folders listed successfully',
        type: responses_dto_1.FolderResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Server error while listing folders',
        type: responses_dto_1.ErrorResponse,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FileController.prototype, "listFolders", null);
__decorate([
    (0, common_1.Get)('folders/:folder'),
    (0, swagger_1.ApiOperation)({ summary: 'Get folder details and list files' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Folder details retrieved successfully',
        type: responses_dto_1.FolderDetailsResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Folder not found',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiQuery)({
        name: 'page',
        required: false,
        description: 'Page number for pagination',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        description: 'Number of files per page',
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Query)('page', new common_1.DefaultValuePipe(1), common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit', new common_1.DefaultValuePipe(10), common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFolderDetails", null);
__decorate([
    (0, common_1.Get)('stream/:folder/:file'),
    (0, swagger_1.ApiParam)({ name: 'folder', required: true, description: 'Folder containing the file' }),
    (0, swagger_1.ApiParam)({ name: 'file', required: true, description: 'Name of the video file' }),
    __param(0, (0, common_1.Param)('file')),
    __param(1, (0, common_1.Param)('folder')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "stream", null);
__decorate([
    (0, common_1.Post)('uploadFromUrl'),
    (0, swagger_1.ApiBody)({ type: upload_by_url_dto_1.UploadByUrlDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [upload_by_url_dto_1.UploadByUrlDto]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "uploadFromUrl", null);
__decorate([
    (0, common_1.Post)('folders'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new folder' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Folder created successfully',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid folder name',
    }),
    (0, swagger_1.ApiBody)({
        schema: { type: 'object', properties: { folderName: { type: 'string' } } },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [requests_dto_1.CreateFolderDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "createFolder", null);
__decorate([
    (0, common_1.Delete)('folders/:folder'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a folder and all its contents' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder to delete' }),
    __param(0, (0, common_1.Param)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "deleteFolder", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download a file from a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "downloadFile", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/metadata'),
    (0, swagger_1.ApiOperation)({ summary: 'Get metadata of a file' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'File metadata retrieved successfully',
        type: responses_dto_1.FileMetadataResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'File not found',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFileMetadata", null);
__decorate([
    (0, common_1.Put)('folders/:folder/files/:filename/move'),
    (0, swagger_1.ApiOperation)({ summary: 'Move or rename a file' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'File moved successfully',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid destination',
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'File not found',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Current folder of the file' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'Current file name' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                newFolder: { type: 'string' },
                newFilename: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, requests_dto_1.MoveFileDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "moveFile", null);
__decorate([
    (0, common_1.Post)('folders/:folder/files/:filename/copy'),
    (0, swagger_1.ApiOperation)({ summary: 'Copy a file to another location' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'File copied successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid destination' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'File not found' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Source folder' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File to copy' }),
    (0, swagger_1.ApiBody)({
        schema: { type: 'object', properties: { newFolder: { type: 'string' } } },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, requests_dto_1.CopyFileDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "copyFile", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/download-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Download all files in a folder as a ZIP archive' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "downloadAllFiles", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/temp-links'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get temporary access links for all files in a folder',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    __param(0, (0, common_1.Param)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getTemporaryLinks", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/temp-link'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate a temporary access link for a file' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getTemporaryFileLink", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/search'),
    (0, swagger_1.ApiOperation)({ summary: 'Search for files by name in a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiQuery)({
        name: 'pattern',
        description: 'Regex pattern for matching filenames',
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Query)('pattern')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "searchFiles", null);
__decorate([
    (0, common_1.Get)('json/folders/:folder/files/:filename'),
    (0, swagger_1.ApiOperation)({
        summary: 'Retrieve the entire JSON file',
        description: 'Returns the complete contents of a JSON file',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'JSON file contents retrieved successfully',
        type: responses_dto_1.JsonFileResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'JSON file not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Error parsing JSON file',
        type: responses_dto_1.ErrorResponse,
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getJsonFile", null);
__decorate([
    (0, common_1.Get)('json/folders/:folder/files/:filename/*path'),
    (0, swagger_1.ApiOperation)({
        summary: 'Retrieve a nested value from a JSON file by key path',
        description: 'Returns a specific value from a JSON file using a path with / as separator',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'JSON value retrieved successfully',
        type: responses_dto_1.JsonValueResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid path or key not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'JSON file not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiParam)({
        name: 'path',
        description: 'Path to the nested value (e.g., user/profile/name)',
        type: String,
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, requests_dto_2.JsonPathParams]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getNestedJsonValue", null);
__decorate([
    (0, common_1.Get)('json/folders/:folder/files/:filename/query'),
    (0, swagger_1.ApiOperation)({
        summary: 'Query a JSON file using dot notation',
        description: 'Query JSON data using dot notation and array indices. Example: users[0].profile.name',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'JSON value retrieved successfully',
        type: responses_dto_1.JsonValueResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid query format or path not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'JSON file not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'query',
        description: 'JSON path query using dot notation (e.g., users[0].profile.name)',
        required: true,
        type: String,
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Query)('query')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "queryJsonFile", null);
__decorate([
    (0, common_1.Delete)('folders/:folder/files/:filename'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a file from a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "deleteFile", null);
__decorate([
    (0, common_1.Put)('folders/:folder/files/:filename/metadata'),
    (0, swagger_1.ApiOperation)({ summary: 'Update file metadata' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'File metadata updated successfully',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid metadata' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'File not found' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                newFilename: { type: 'string', description: 'New filename' },
                newFolder: { type: 'string', description: 'New folder' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, requests_dto_1.UpdateFileMetadataDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "updateFileMetadata", null);
__decorate([
    (0, common_1.Get)('folders/:folder/size'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the total size of a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    __param(0, (0, common_1.Param)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getFolderSize", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files'),
    (0, swagger_1.ApiOperation)({ summary: 'List all files in a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    __param(0, (0, common_1.Param)('folder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "listFiles", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/thumbnail'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a thumbnail of an image or video file' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getThumbnail", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename'),
    (0, swagger_1.ApiOperation)({ summary: 'Retrieve a file from a folder' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getFile", null);
__decorate([
    (0, common_1.Put)('folders/:folder/rename'),
    (0, swagger_1.ApiOperation)({ summary: 'Rename a folder' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Folder renamed successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid folder name' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Folder not found' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Current folder name' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: { newFolderName: { type: 'string' } },
        },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, requests_dto_1.RenameFolderDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "renameFolder", null);
__decorate([
    (0, common_1.Put)('folders/:folder/move'),
    (0, swagger_1.ApiOperation)({ summary: 'Move a folder to a different location' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Folder moved successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid destination' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Folder not found' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Current folder name' }),
    (0, swagger_1.ApiBody)({
        schema: { type: 'object', properties: { newLocation: { type: 'string' } } },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, requests_dto_1.MoveFolderDto]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "moveFolder", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a preview of a file' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getFilePreview", null);
__decorate([
    (0, common_1.Get)('folders/tree'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a hierarchical tree structure of folders and files',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Folder tree retrieved successfully',
        type: responses_dto_1.FolderTreeResponse,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFolderTree", null);
__decorate([
    (0, common_1.Post)('folders/:folder/files/:filename/share'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate a shareable link for a file' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Shareable link generated',
        type: responses_dto_1.ShareableLinkResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'File not found',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "generateShareableLink", null);
__decorate([
    (0, common_1.Put)('folders/:folder/files/:filename/lock'),
    (0, swagger_1.ApiOperation)({ summary: 'Lock a file for editing' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'File is already locked',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'File not found',
        type: responses_dto_1.ErrorResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Error locking file',
        type: responses_dto_1.ErrorResponse,
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "lockFile", null);
__decorate([
    (0, common_1.Put)('folders/:folder/files/:filename/unlock'),
    (0, swagger_1.ApiOperation)({ summary: 'Unlock a file for editing' }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FileController.prototype, "unlockFile", null);
__decorate([
    (0, common_1.Get)('files/recent'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a list of recently modified files' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FileController.prototype, "getRecentFiles", null);
__decorate([
    (0, common_1.Get)('folders/:folder/files/:filename/versions'),
    (0, swagger_1.ApiOperation)({ summary: 'Get different versions of a file' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'File versions retrieved successfully',
        type: responses_dto_1.FileVersionResponse,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'File not found',
    }),
    (0, swagger_1.ApiParam)({ name: 'folder', description: 'Folder name' }),
    (0, swagger_1.ApiParam)({ name: 'filename', description: 'File name' }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Param)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "getFileVersions", null);
__decorate([
    (0, common_1.Get)('metrics/file-operations'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get file operation metrics',
        description: 'Retrieve metrics about recent file operations including success rate and performance data',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'File operation metrics retrieved successfully',
        type: responses_dto_1.FileOperationMetricsResponse,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'timeWindow',
        required: false,
        description: 'Time window in milliseconds for failure rate calculation',
        type: Number,
        example: 3600000,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        description: 'Maximum number of metrics to return',
        type: Number,
        example: 100,
    }),
    __param(0, (0, common_1.Query)('timeWindow', new common_1.DefaultValuePipe(3600000), common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit', new common_1.DefaultValuePipe(100), common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", responses_dto_1.FileOperationMetricsResponse)
], FileController.prototype, "getFileOperationMetrics", null);
__decorate([
    (0, common_1.Post)('folders/:folder/copy'),
    (0, swagger_1.ApiOperation)({
        summary: 'Copy a folder to a new location',
        description: 'Creates a copy of a folder and all its contents at a new location',
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Folder copied successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
                sourceFolder: { type: 'string' },
                destinationFolder: { type: 'string' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid destination or destination already exists',
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Source folder not found',
    }),
    (0, swagger_1.ApiParam)({
        name: 'folder',
        description: 'Source folder name to copy',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['destinationFolder'],
            properties: {
                destinationFolder: {
                    type: 'string',
                    description: 'Name of the destination folder where the copy will be created',
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('folder')),
    __param(1, (0, common_1.Body)('destinationFolder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FileController.prototype, "copyFolder", null);
exports.FileController = FileController = FileController_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [file_service_1.FileService])
], FileController);
//# sourceMappingURL=file.controller.js.map
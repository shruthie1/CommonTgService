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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOperationMetricsResponse = exports.FileOperationMetricDto = exports.JsonValueResponse = exports.JsonFileResponse = exports.ErrorResponse = exports.FolderTreeResponse = exports.FileVersionResponse = exports.ShareableLinkResponse = exports.FolderDetailsResponse = exports.FolderResponse = exports.FileMetadataResponse = void 0;
const swagger_1 = require("@nestjs/swagger");
class FileMetadataResponse {
}
exports.FileMetadataResponse = FileMetadataResponse;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'document.pdf', description: 'Name of the file' }),
    __metadata("design:type", String)
], FileMetadataResponse.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1024, description: 'Size of file in bytes' }),
    __metadata("design:type", Number)
], FileMetadataResponse.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '2024-02-20T10:00:00.000Z',
        description: 'Creation timestamp',
    }),
    __metadata("design:type", Date)
], FileMetadataResponse.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '2024-02-20T11:30:00.000Z',
        description: 'Last modification timestamp',
    }),
    __metadata("design:type", Date)
], FileMetadataResponse.prototype, "modifiedAt", void 0);
class FolderResponse {
}
exports.FolderResponse = FolderResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['folder1', 'folder2'],
        description: 'List of folder names',
    }),
    __metadata("design:type", Array)
], FolderResponse.prototype, "folders", void 0);
class FolderDetailsResponse {
}
exports.FolderDetailsResponse = FolderDetailsResponse;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'documents', description: 'Name of the folder' }),
    __metadata("design:type", String)
], FolderDetailsResponse.prototype, "folder", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['file1.pdf', 'file2.jpg'],
        description: 'List of files in the folder',
    }),
    __metadata("design:type", Array)
], FolderDetailsResponse.prototype, "files", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 100, description: 'Total number of files in folder' }),
    __metadata("design:type", Number)
], FolderDetailsResponse.prototype, "totalFiles", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'Current page number' }),
    __metadata("design:type", Number)
], FolderDetailsResponse.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: 'Number of items per page' }),
    __metadata("design:type", Number)
], FolderDetailsResponse.prototype, "limit", void 0);
class ShareableLinkResponse {
}
exports.ShareableLinkResponse = ShareableLinkResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'https://promoteClients2.glitch.me/folders/docs/files/example.pdf?share=true',
        description: 'Generated shareable link for the file',
    }),
    __metadata("design:type", String)
], ShareableLinkResponse.prototype, "shareableLink", void 0);
class FileVersionResponse {
}
exports.FileVersionResponse = FileVersionResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'document.pdf',
        description: 'Name of the original file',
    }),
    __metadata("design:type", String)
], FileVersionResponse.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: [
            { version: '1', filename: 'document.pdf.v1' },
            { version: '2', filename: 'document.pdf.v2' },
        ],
        description: 'List of available versions',
    }),
    __metadata("design:type", Array)
], FileVersionResponse.prototype, "versions", void 0);
class FolderTreeResponse {
}
exports.FolderTreeResponse = FolderTreeResponse;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'root', description: 'Name of the current node' }),
    __metadata("design:type", String)
], FolderTreeResponse.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: [{ name: 'folder1', children: [] }, { name: 'file1.pdf' }],
        description: 'Child nodes (folders and files)',
    }),
    __metadata("design:type", Array)
], FolderTreeResponse.prototype, "children", void 0);
class ErrorResponse {
}
exports.ErrorResponse = ErrorResponse;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 400, description: 'HTTP status code' }),
    __metadata("design:type", Number)
], ErrorResponse.prototype, "statusCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'File not found', description: 'Error message' }),
    __metadata("design:type", String)
], ErrorResponse.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Bad Request', description: 'Error type' }),
    __metadata("design:type", String)
], ErrorResponse.prototype, "error", void 0);
class JsonFileResponse {
}
exports.JsonFileResponse = JsonFileResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: {
            key: 'value',
            name: 'example',
            age: 30,
            nested: {
                key: 'value',
            },
        },
        description: 'JSON file content',
    }),
    __metadata("design:type", Object)
], JsonFileResponse.prototype, "content", void 0);
class JsonValueResponse {
}
exports.JsonValueResponse = JsonValueResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'value',
        description: 'Value at the specified path in the JSON file',
    }),
    __metadata("design:type", Object)
], JsonValueResponse.prototype, "value", void 0);
class FileOperationMetricDto {
}
exports.FileOperationMetricDto = FileOperationMetricDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'createFolder',
        description: 'Name of the file operation',
    }),
    __metadata("design:type", String)
], FileOperationMetricDto.prototype, "operation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: 'Whether the operation succeeded',
    }),
    __metadata("design:type", Boolean)
], FileOperationMetricDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 123,
        description: 'Duration of operation in milliseconds',
    }),
    __metadata("design:type", Number)
], FileOperationMetricDto.prototype, "duration", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1645564789123,
        description: 'Timestamp of the operation',
    }),
    __metadata("design:type", Number)
], FileOperationMetricDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '/uploads/docs',
        required: false,
        description: 'Path involved in the operation',
    }),
    __metadata("design:type", String)
], FileOperationMetricDto.prototype, "path", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        required: false,
        description: 'Error message if operation failed',
    }),
    __metadata("design:type", String)
], FileOperationMetricDto.prototype, "error", void 0);
class FileOperationMetricsResponse {
}
exports.FileOperationMetricsResponse = FileOperationMetricsResponse;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [FileOperationMetricDto],
        description: 'Recent file operation metrics',
    }),
    __metadata("design:type", Array)
], FileOperationMetricsResponse.prototype, "metrics", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 0.05,
        description: 'Rate of failed operations in the time window',
    }),
    __metadata("design:type", Number)
], FileOperationMetricsResponse.prototype, "failureRate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3600000, description: 'Time window in milliseconds' }),
    __metadata("design:type", Number)
], FileOperationMetricsResponse.prototype, "timeWindow", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 100,
        description: 'Total number of operations recorded',
    }),
    __metadata("design:type", Number)
], FileOperationMetricsResponse.prototype, "totalOperations", void 0);
//# sourceMappingURL=responses.dto.js.map
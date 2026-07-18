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
exports.CopyFolderDto = exports.JsonQuery = exports.JsonPathParams = exports.UpdateFileMetadataDto = exports.CopyFileDto = exports.RenameFolderDto = exports.MoveFolderDto = exports.MoveFileDto = exports.CreateFolderDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateFolderDto {
}
exports.CreateFolderDto = CreateFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'documents',
        description: 'Name of the folder to create',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateFolderDto.prototype, "folderName", void 0);
class MoveFileDto {
}
exports.MoveFileDto = MoveFileDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'destination',
        description: 'New folder path for the file',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MoveFileDto.prototype, "newFolder", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'newname.pdf', description: 'New name for the file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], MoveFileDto.prototype, "newFilename", void 0);
class MoveFolderDto {
}
exports.MoveFolderDto = MoveFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'new-location',
        description: 'New location path for the folder',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], MoveFolderDto.prototype, "newLocation", void 0);
class RenameFolderDto {
}
exports.RenameFolderDto = RenameFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'new-folder-name',
        description: 'New name for the folder',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], RenameFolderDto.prototype, "newFolderName", void 0);
class CopyFileDto {
}
exports.CopyFileDto = CopyFileDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'destination',
        description: 'Destination folder for the file copy',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CopyFileDto.prototype, "newFolder", void 0);
class UpdateFileMetadataDto {
}
exports.UpdateFileMetadataDto = UpdateFileMetadataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'newname.pdf', description: 'New name for the file' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateFileMetadataDto.prototype, "newFilename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'new-folder',
        description: 'New folder for the file',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateFileMetadataDto.prototype, "newFolder", void 0);
class JsonPathParams {
}
exports.JsonPathParams = JsonPathParams;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['user', 'profile', 'name'],
        description: 'Path segments to the nested value',
        isArray: true,
    }),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.IsNotEmpty)({ each: true }),
    __metadata("design:type", Array)
], JsonPathParams.prototype, "path", void 0);
class JsonQuery {
}
exports.JsonQuery = JsonQuery;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'data.users[0].name',
        description: 'JSON path query using dot notation',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], JsonQuery.prototype, "query", void 0);
class CopyFolderDto {
}
exports.CopyFolderDto = CopyFolderDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'destination-folder',
        description: 'Destination folder for the folder copy',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CopyFolderDto.prototype, "destinationFolder", void 0);
//# sourceMappingURL=requests.dto.js.map
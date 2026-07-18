import { Response, Request } from 'express';
import { FileService } from './file.service';
import { CreateFolderDto, MoveFileDto, MoveFolderDto, RenameFolderDto, CopyFileDto, UpdateFileMetadataDto } from './dto/requests.dto';
import { FileMetadataResponse, FolderResponse, FolderDetailsResponse, ShareableLinkResponse, FileVersionResponse, FolderTreeResponse, JsonFileResponse, JsonValueResponse, FileOperationMetricsResponse } from './dto/responses.dto';
import { JsonPathParams } from './dto/requests.dto';
import { UploadByUrlDto } from './dto/upload-by-url.dto';
export declare class FileController {
    private readonly logger;
    private readonly fileService;
    constructor(fileService: FileService);
    uploadFiles(folder: string, files: Express.Multer.File[]): Promise<{
        message: string;
        files: {
            filename: string;
        }[];
    }>;
    listFolders(): Promise<FolderResponse>;
    getFolderDetails(folder: string, page: number, limit: number): Promise<FolderDetailsResponse>;
    stream(file: string, folder: string, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    uploadFromUrl(body: UploadByUrlDto): Promise<{
        results: any[];
    }>;
    createFolder(createFolderDto: CreateFolderDto): Promise<{
        message: string;
        folder: string;
    }>;
    deleteFolder(folder: string): Promise<{
        message: string;
    }>;
    downloadFile(folder: string, filename: string, res: Response): void;
    getFileMetadata(folder: string, filename: string): Promise<FileMetadataResponse>;
    moveFile(folder: string, filename: string, moveFileDto: MoveFileDto): {
        message: string;
        newPath: string;
    };
    copyFile(folder: string, filename: string, copyFileDto: CopyFileDto): {
        message: string;
        newPath: string;
    };
    downloadAllFiles(folder: string, res: Response): Promise<void>;
    getTemporaryLinks(folder: string): {
        folder: string;
        fileLinks: {
            filename: string;
            url: string;
        }[];
    };
    getTemporaryFileLink(folder: string, filename: string): {
        url: string;
    };
    searchFiles(folder: string, pattern: string): {
        folder: string;
        pattern: string;
        matchingFiles: string[];
    };
    getJsonFile(folder: string, filename: string): Promise<JsonFileResponse>;
    getNestedJsonValue(folder: string, filename: string, pathParams: JsonPathParams): Promise<JsonValueResponse>;
    queryJsonFile(folder: string, filename: string, query: string): Promise<JsonValueResponse>;
    deleteFile(folder: string, filename: string): {
        message: string;
    };
    updateFileMetadata(folder: string, filename: string, updateFileMetadataDto: UpdateFileMetadataDto): {
        message: string;
        newPath: string;
    };
    getFolderSize(folder: string): {
        folder: string;
        size: number;
    };
    listFiles(folder: string): {
        folder: string;
        files: string[];
    };
    getThumbnail(folder: string, filename: string, res: Response): Promise<Response<any, Record<string, any>>>;
    getFile(folder: string, filename: string, res: Response): void;
    renameFolder(folder: string, renameFolderDto: RenameFolderDto): {
        message: string;
        newFolderName: string;
    };
    moveFolder(folder: string, moveFolderDto: MoveFolderDto): {
        message: string;
        newFolderPath: string;
    };
    getFilePreview(folder: string, filename: string, req: Request, res: Response): Promise<Response<any, Record<string, any>> | {
        preview: string;
        mimeType: any;
    }>;
    getFolderTree(): Promise<FolderTreeResponse>;
    generateShareableLink(folder: string, filename: string): Promise<ShareableLinkResponse>;
    lockFile(folder: string, filename: string): {
        message: string;
    };
    unlockFile(folder: string, filename: string): {
        message: string;
    };
    getRecentFiles(): any[];
    getFileVersions(folder: string, filename: string): Promise<FileVersionResponse>;
    getFileOperationMetrics(timeWindow: number, limit: number): FileOperationMetricsResponse;
    copyFolder(folder: string, destinationFolder: string): Promise<{
        message: string;
        sourceFolder: string;
        destinationFolder: string;
    }>;
}

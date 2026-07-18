import { OnModuleInit } from '@nestjs/common';
import { Response, Request } from 'express';
import { FileMetadataResponse, FolderResponse, FolderDetailsResponse, ShareableLinkResponse, FileVersionResponse, FolderTreeResponse, JsonFileResponse, JsonValueResponse } from './dto/responses.dto';
import { FileModuleOptions } from './file.module.interface';
export declare class FileService implements OnModuleInit {
    private options?;
    private readonly logger;
    private readonly config;
    constructor(options?: FileModuleOptions);
    private getSafePath;
    validateFileType(file: Express.Multer.File): boolean;
    validateFileSize(file: Express.Multer.File): boolean;
    listFolders(): Promise<FolderResponse>;
    getFolderDetails(folder: string, page?: number, limit?: number): Promise<FolderDetailsResponse>;
    createFolder(folderName: string): Promise<{
        message: string;
        folder: string;
    }>;
    deleteFolder(folder: string): Promise<{
        message: string;
    }>;
    getDestination(req: any, file: any, cb: any): void;
    getFilename(req: any, file: any, cb: any): void;
    uploadFiles(folder: string, files: Express.Multer.File[]): {
        message: string;
        files: {
            filename: string;
        }[];
    };
    downloadFile(folder: string, filename: string, res: Response): void;
    getFileMetadata(folder: string, filename: string): Promise<FileMetadataResponse>;
    moveFile(folder: string, filename: string, body: {
        newFolder?: string;
        newFilename?: string;
    }): {
        message: string;
        newPath: string;
    };
    copyFile(folder: string, filename: string, body: {
        newFolder?: string;
    }): {
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
    getNestedJsonValue(folder: string, filename: string, pathParams: any): Promise<JsonValueResponse>;
    queryJsonFile(folder: string, filename: string, query: string): Promise<JsonValueResponse>;
    deleteFile(folder: string, filename: string): {
        message: string;
    };
    updateFileMetadata(folder: string, filename: string, body: {
        newFilename?: string;
        newFolder?: string;
    }): {
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
    getFile(folder: string, filename: string, res: Response): void;
    renameFolder(folder: string, newFolderName: string): {
        message: string;
        newFolderName: string;
    };
    moveFolder(folder: string, newLocation: string): {
        message: string;
        newFolderPath: string;
    };
    getFilePreview(folder: string, filename: string, req: Request, res: Response): Promise<Response<any, Record<string, any>> | {
        preview: string;
        mimeType: any;
    }>;
    getThumbnail(folder: string, filename: string, res: Response): Promise<Response<any, Record<string, any>>>;
    private isPreviewSupported;
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
    onModuleInit(): void;
    copyFolder(sourceFolder: string, destinationFolder: string): Promise<{
        message: string;
        sourceFolder: string;
        destinationFolder: string;
    }>;
    stream(filename: string, folder: string, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    uploadFromUrl(files: Record<string, string>, folderName: string): Promise<{
        results: any[];
    }>;
}

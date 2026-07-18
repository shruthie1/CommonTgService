export declare class CreateFolderDto {
    folderName: string;
}
export declare class MoveFileDto {
    newFolder?: string;
    newFilename?: string;
}
export declare class MoveFolderDto {
    newLocation: string;
}
export declare class RenameFolderDto {
    newFolderName: string;
}
export declare class CopyFileDto {
    newFolder: string;
}
export declare class UpdateFileMetadataDto {
    newFilename?: string;
    newFolder?: string;
}
export declare class JsonPathParams {
    path: string[];
}
export declare class JsonQuery {
    query: string;
}
export declare class CopyFolderDto {
    destinationFolder: string;
}

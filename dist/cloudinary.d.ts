import * as cloudinary from 'cloudinary';
export declare class CloudinaryService {
    static instance: any;
    resources: Map<any, any>;
    constructor();
    static getInstance(name: any): Promise<any>;
    downloadAndExtractZip(url: string): Promise<void>;
    getResourcesFromFolder(folderName: any): Promise<void>;
    createNewFolder(folderName: any): Promise<void>;
    overwriteFile(): Promise<void>;
    findAndSaveResources(folderName: string, type: string): Promise<void>;
    createFolder(folderName: any): Promise<any>;
    uploadFilesToFolder(folderName: any): Promise<(cloudinary.UploadApiResponse | cloudinary.UploadStream)[]>;
    printResources(): Promise<void>;
    get(publicId: any): any;
    getBuffer(publicId: any): any;
}

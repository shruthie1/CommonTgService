export declare class CloudinaryService {
    static instance: any;
    static getInstance(_name?: string): Promise<any>;
    downloadAndExtractZip(url: string): Promise<string>;
    getResourcesFromFolder(folderName: any): Promise<string>;
}

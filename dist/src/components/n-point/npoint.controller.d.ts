import { NpointService } from './npoint.service';
export declare class NpointController {
    private readonly npointService;
    constructor(npointService: NpointService);
    fetchDocument(id: string): Promise<any>;
    postDocument(document: any): Promise<any>;
    fetchAllDocuments(): Promise<any[]>;
    updateDocument(id: string, updatedDocument: any): Promise<any>;
}

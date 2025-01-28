export declare class NpointService {
    private readonly logger;
    private csrfToken;
    private cookie;
    private readonly baseUrl;
    private readonly signInUrl;
    private fetchCsrfToken;
    private ensureCsrfToken;
    fetchDocument(documentId: string): Promise<any>;
    postDocument(document: any): Promise<any>;
    updateDocument(documentId: string, updatedDocument: any): Promise<any>;
    fetchAllDocuments(): Promise<any[]>;
    fetchCsrfTokenFromHtml(data: any): Promise<string>;
}

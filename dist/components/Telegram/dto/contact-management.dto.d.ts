export declare class ContactGroupDto {
    name: string;
    userIds: string[];
    description?: string;
}
export declare class ContactBlockListDto {
    userIds: string[];
    block: boolean;
}
export declare class ContactExportImportDto {
    format: 'vcard' | 'csv';
    includeBlocked?: boolean;
}

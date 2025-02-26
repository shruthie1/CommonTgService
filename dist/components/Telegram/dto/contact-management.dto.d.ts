export type ExportFormat = 'vcard' | 'csv';
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
    format: ExportFormat;
    includeBlocked: boolean;
}
export declare class ContactImportDto {
    contacts: Array<{
        firstName: string;
        lastName?: string;
        phone: string;
    }>;
}
export declare class AddContactsDto {
    phoneNumbers: string[];
    prefix: string;
}

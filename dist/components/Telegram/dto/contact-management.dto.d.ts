export declare class ContactGroupDto {
    name: string;
    userIds: string[];
    description?: string;
}
export declare class ContactBlockListDto {
    userIds: string[];
    block: boolean;
}
export type ExportFormat = 'vcard' | 'csv';
export declare class ContactExportImportDto {
    format: ExportFormat;
    includeBlocked: boolean;
}
interface ContactData {
    firstName: string;
    lastName?: string;
    phone: string;
}
export declare class ContactImportDto {
    contacts: ContactData[];
}
export {};

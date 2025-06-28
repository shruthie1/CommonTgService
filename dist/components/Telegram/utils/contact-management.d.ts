import { Api, TelegramClient } from 'telegram';
interface ContactData {
    mobile: string;
    tgId?: string;
}
interface ImportResult {
    success: boolean;
    phone: string;
    error?: string;
}
interface BlockListResult {
    success: boolean;
    userId: string;
    error?: string;
}
interface ContactStatistics {
    total: number;
    online: number;
    withPhone: number;
    mutual: number;
    lastWeekActive: number;
}
export declare function addContact(client: TelegramClient, data: ContactData[], namePrefix: string): Promise<ImportResult[]>;
export declare function addContacts(client: TelegramClient, mobiles: string[], namePrefix: string): Promise<ImportResult[]>;
export declare function exportContacts(client: TelegramClient, format: 'vcard' | 'csv', includeBlocked?: boolean): Promise<string>;
export declare function importContacts(client: TelegramClient, data: {
    firstName: string;
    lastName?: string;
    phone: string;
}[]): Promise<ImportResult[]>;
export declare function manageBlockList(client: TelegramClient, userIds: string[], block: boolean): Promise<BlockListResult[]>;
export declare function getContactStatistics(client: TelegramClient): Promise<ContactStatistics>;
export declare function sendContactsFile(client: TelegramClient, chatId: string, contacts: Api.contacts.Contacts, filename?: string): Promise<void>;
export {};

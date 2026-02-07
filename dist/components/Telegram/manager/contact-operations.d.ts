import { Api } from 'telegram';
import { TgContext, ContactStats, ImportContactResult, BlockListResult } from './types';
export declare function addContact(ctx: TgContext, data: {
    mobile: string;
    tgId: string;
}[], namePrefix: string): Promise<void>;
export declare function addContacts(ctx: TgContext, mobiles: string[], namePrefix: string): Promise<void>;
export declare function getContacts(ctx: TgContext): Promise<Api.contacts.TypeContacts>;
export declare function blockUser(ctx: TgContext, chatId: string): Promise<void>;
export declare function exportContacts(ctx: TgContext, format: 'vcard' | 'csv', includeBlocked?: boolean): Promise<string>;
export declare function importContacts(ctx: TgContext, data: {
    firstName: string;
    lastName?: string;
    phone: string;
}[]): Promise<ImportContactResult[]>;
export declare function manageBlockList(ctx: TgContext, userIds: string[], block: boolean): Promise<BlockListResult[]>;
export declare function getContactStatistics(ctx: TgContext): Promise<ContactStats>;
export declare function sendContactsFile(ctx: TgContext, chatId: string, contacts: Api.contacts.Contacts, filename?: string): Promise<void>;

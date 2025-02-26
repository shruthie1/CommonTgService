export interface ContactData {
    mobile: string;
    tgId: string;
}
export declare class AddContactDto {
    data: ContactData[];
    prefix: string;
}
export declare class AddContactsDto {
    phoneNumbers: string[];
    prefix?: string;
}

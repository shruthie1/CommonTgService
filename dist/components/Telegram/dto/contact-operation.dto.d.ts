export interface ContactData {
    mobile: string;
    tgId: string;
}
export declare class AddContactDto {
    mobile: string;
    data: ContactData[];
    prefix: string;
}
export declare class AddContactsDto {
    mobile: string;
    phoneNumbers: string[];
    prefix: string;
}

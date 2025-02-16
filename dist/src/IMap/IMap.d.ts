export declare class MailReader {
    private static instance;
    private imap;
    private isReady;
    private result;
    private constructor();
    static getInstance(): MailReader;
    connectToMail(): Promise<void>;
    disconnectFromMail(): Promise<void>;
    isMailReady(): Promise<boolean>;
    getCode(): Promise<string>;
    private openInbox;
}

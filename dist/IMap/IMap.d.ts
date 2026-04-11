import Imap from 'imap';
export interface MailCodeLookupOptions {
    expectedLength?: number;
    minReceivedAt?: Date;
}
export declare function extractTelegramCode(body: string, expectedLength?: number): string | null;
export declare function isMailFreshEnough(receivedAt: Date | null, minReceivedAt?: Date): boolean;
export declare class MailReader {
    private readonly imapFactory;
    private static instance;
    private imap;
    private isReady;
    private connectPromise;
    private mailboxQueue;
    private constructor();
    static createForTest(imapFactory: () => Imap): MailReader;
    private ensureImap;
    static getInstance(): MailReader;
    runExclusive<T>(operation: () => Promise<T>): Promise<T>;
    connectToMail(timeoutMs?: number): Promise<void>;
    disconnectFromMail(): Promise<void>;
    isMailReady(): Promise<boolean>;
    getCode(options?: MailCodeLookupOptions): Promise<string | null>;
    private openInbox;
    private deleteMessage;
}

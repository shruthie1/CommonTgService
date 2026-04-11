import Imap from 'imap';
import { parseError } from '../utils/parseError';

const DEFAULT_IMAP_CONNECT_TIMEOUT_MS = 30_000;
const MAIL_CLOCK_SKEW_MS = 60_000;
const TELEGRAM_CODE_PATTERN = /\b\d{4,8}\b/g;

export interface MailCodeLookupOptions {
    expectedLength?: number;
    minReceivedAt?: Date;
}

export function extractTelegramCode(body: string, expectedLength?: number): string | null {
    const matches: string[] = body.match(TELEGRAM_CODE_PATTERN) ?? [];
    if (expectedLength) {
        return matches.find((match) => match.length === expectedLength) || null;
    }
    return matches[0] || null;
}

export function isMailFreshEnough(receivedAt: Date | null, minReceivedAt?: Date): boolean {
    if (!minReceivedAt || !receivedAt) return true;
    return receivedAt.getTime() >= minReceivedAt.getTime() - MAIL_CLOCK_SKEW_MS;
}

export class MailReader {
    private static instance: MailReader;
    private imap: Imap | null = null;
    private isReady: boolean = false;
    private connectPromise: Promise<void> | null = null;
    private mailboxQueue: Promise<void> = Promise.resolve();

    private constructor(private readonly imapFactory: () => Imap = () => new Imap({
            user: process.env.GMAIL_ADD || '',
            password: process.env.GMAIL_PASS || '',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        })) {}

    public static createForTest(imapFactory: () => Imap): MailReader {
        return new MailReader(imapFactory);
    }

    private ensureImap(): Imap {
        if (this.imap) {
            return this.imap;
        }

        const imap = this.imapFactory();
        imap.on('ready', () => {
            console.log('Mail is Ready');
            this.isReady = true;
        });

        imap.on('error', (err: Error) => {
            console.error('SomeError:', err);
            this.isReady = false;
        });

        imap.on('end', () => {
            console.log('Connection ended');
            this.isReady = false;
        });
        this.imap = imap;
        return imap;
    }

    public static getInstance(): MailReader {
        if (!MailReader.instance) {
            MailReader.instance = new MailReader();
        }
        return MailReader.instance;
    }

    public async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
        let releaseLock: (() => void) | null = null;
        const previous = this.mailboxQueue;
        this.mailboxQueue = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        await previous;
        try {
            return await operation();
        } finally {
            releaseLock?.();
        }
    }

    public async connectToMail(timeoutMs: number = DEFAULT_IMAP_CONNECT_TIMEOUT_MS): Promise<void> {
        console.log('Connecting to mail server');
        if (this.isReady && this.imap) {
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }

        const imap = this.ensureImap();
        this.isReady = false;

        this.connectPromise = new Promise<void>((resolve, reject) => {
            let timeoutHandle: NodeJS.Timeout | null = null;

            const cleanup = () => {
                imap.removeListener('ready', onReady);
                imap.removeListener('error', onError);
                imap.removeListener('end', onEndBeforeReady);
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
            };

            const onReady = () => {
                cleanup();
                console.log('Mail connect() completed');
                resolve();
            };

            const onError = (err: Error) => {
                cleanup();
                this.imap = null;
                reject(new Error(`Mail connection failed: ${parseError(err)}`));
            };

            const onEndBeforeReady = () => {
                cleanup();
                this.imap = null;
                reject(new Error('Mail connection ended before ready'));
            };

            timeoutHandle = setTimeout(() => {
                cleanup();
                this.imap = null;
                reject(new Error(`Mail server connection timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            imap.once('ready', onReady);
            imap.once('error', onError);
            imap.once('end', onEndBeforeReady);

            try {
                imap.connect();
                console.log('Mail connect() initiated — waiting for ready event');
            } catch (err) {
                cleanup();
                this.imap = null;
                reject(err);
            }
        }).finally(() => {
            this.connectPromise = null;
        });

        return this.connectPromise;
    }

    public async disconnectFromMail(): Promise<void> {
        console.log('Disconnecting from mail server');
        const imap = this.imap;
        this.imap = null;
        this.isReady = false;
        this.connectPromise = null;

        if (!imap) {
            console.log('Mail server already disconnected');
            return;
        }

        try {
            await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    imap.removeListener('end', finish);
                    imap.removeListener('error', finish);
                    resolve();
                };

                imap.once('end', finish);
                imap.once('error', finish);

                try {
                    imap.end();
                } catch (err) {
                    console.error('Error disconnecting from mail server:', parseError(err));
                    finish();
                    return;
                }

                setTimeout(finish, 5000);
            });
            console.log('Disconnected from mail server');
        } catch (err) {
            console.error('Error disconnecting from mail server:', parseError(err));
            throw err;
        }
    }

    public async isMailReady(): Promise<boolean> {
        return this.isReady;
    }

    public async getCode(options: MailCodeLookupOptions = {}): Promise<string | null> {
        console.log('MailReady : ', this.isReady);
        if (!this.isReady || !this.imap) {
            throw new Error('Mail server is not ready');
        }

        try {
            await this.openInbox();

            const searchCriteria = [['FROM', 'noreply@telegram.org']];
            const fetchOptions = { bodies: ['TEXT'], markSeen: false };
            console.log('Inbox Opened');

            const results = await new Promise<number[]>((resolve, reject) => {
                this.imap!.search(searchCriteria, (err, foundResults) => {
                    if (err) {
                        console.error('Search error:', parseError(err));
                        reject(err);
                    } else {
                        resolve(foundResults);
                    }
                });
            });

            if (results.length === 0) {
                console.log('No new emails found');
                return null;
            }

            console.log('Emails found:', results.length);
            const candidateIds = results.slice(-10).reverse();
            const candidates: Array<{ seqno: number; order: number; code: string; receivedAt: Date | null }> = [];
            const fetch = this.imap.fetch(candidateIds, fetchOptions);

            await new Promise<void>((resolve, reject) => {
                fetch.on('message', (msg: any, seqno: number) => {
                    let messageBody = '';
                    let receivedAt: Date | null = null;

                    msg.on('body', (stream: any) => {
                        stream.on('data', (chunk: Buffer | string) => {
                            messageBody += chunk.toString('utf8');
                        });
                    });

                    msg.once('attributes', (attrs: any) => {
                        if (attrs?.date) {
                            receivedAt = attrs.date instanceof Date ? attrs.date : new Date(attrs.date);
                        }
                    });

                    msg.once('end', () => {
                        const code = extractTelegramCode(messageBody, options.expectedLength);
                        if (code && isMailFreshEnough(receivedAt, options.minReceivedAt)) {
                            candidates.push({
                                seqno,
                                order: candidateIds.indexOf(seqno),
                                code,
                                receivedAt,
                            });
                        }
                    });
                });

                fetch.once('error', (err: Error) => reject(err));
                fetch.once('end', () => {
                    console.log('Fetched mails');
                    resolve();
                });
            });

            const match = candidates.sort((a, b) => a.order - b.order)[0];
            if (!match) {
                console.log('No matching Telegram verification code found');
                return null;
            }

            await this.deleteMessage(match.seqno);
            console.log('Returning result:', match.code);
            return match.code;
        } catch (error) {
            console.error('Error:', error);
            this.isReady = false;
            throw error;
        }
    }

    private async openInbox(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.imap!.openBox('INBOX', false, (err) => {
                if (err) {
                    console.error('Open Inbox error:', parseError(err));
                    reject(err);
                } else {
                    console.log('Inbox opened');
                    resolve();
                }
            });
        });
    }

    private async deleteMessage(seqno: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.imap!.seq.addFlags([seqno], '\\Deleted', (flagError) => {
                if (flagError) {
                    reject(flagError);
                    return;
                }

                this.imap!.expunge((expungeError) => {
                    if (expungeError) {
                        reject(expungeError);
                        return;
                    }
                    console.log(`Deleted message ${seqno}`);
                    resolve();
                });
            });
        });
    }
}

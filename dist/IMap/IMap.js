"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailReader = void 0;
exports.extractTelegramCode = extractTelegramCode;
exports.isMailFreshEnough = isMailFreshEnough;
const imap_1 = __importDefault(require("imap"));
const parseError_1 = require("../utils/parseError");
const DEFAULT_IMAP_CONNECT_TIMEOUT_MS = 30_000;
const MAIL_CLOCK_SKEW_MS = 60_000;
const TELEGRAM_CODE_PATTERN = /\b\d{4,8}\b/g;
function extractTelegramCode(body, expectedLength) {
    const matches = body.match(TELEGRAM_CODE_PATTERN) ?? [];
    if (expectedLength) {
        return matches.find((match) => match.length === expectedLength) || null;
    }
    return matches[0] || null;
}
function isMailFreshEnough(receivedAt, minReceivedAt) {
    if (!minReceivedAt || !receivedAt)
        return true;
    return receivedAt.getTime() >= minReceivedAt.getTime() - MAIL_CLOCK_SKEW_MS;
}
class MailReader {
    constructor(imapFactory = () => new imap_1.default({
        user: process.env.GMAIL_ADD || '',
        password: process.env.GMAIL_PASS || '',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: {
            rejectUnauthorized: false,
        },
    })) {
        this.imapFactory = imapFactory;
        this.imap = null;
        this.isReady = false;
        this.connectPromise = null;
        this.mailboxQueue = Promise.resolve();
    }
    static createForTest(imapFactory) {
        return new MailReader(imapFactory);
    }
    ensureImap() {
        if (this.imap) {
            return this.imap;
        }
        const imap = this.imapFactory();
        imap.on('ready', () => {
            console.log('Mail is Ready');
            this.isReady = true;
        });
        imap.on('error', (err) => {
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
    static getInstance() {
        if (!MailReader.instance) {
            MailReader.instance = new MailReader();
        }
        return MailReader.instance;
    }
    async runExclusive(operation) {
        let releaseLock = null;
        const previous = this.mailboxQueue;
        this.mailboxQueue = new Promise((resolve) => {
            releaseLock = resolve;
        });
        await previous;
        try {
            return await operation();
        }
        finally {
            releaseLock?.();
        }
    }
    async connectToMail(timeoutMs = DEFAULT_IMAP_CONNECT_TIMEOUT_MS) {
        console.log('Connecting to mail server');
        if (this.isReady && this.imap) {
            return;
        }
        if (this.connectPromise) {
            return this.connectPromise;
        }
        const imap = this.ensureImap();
        this.isReady = false;
        this.connectPromise = new Promise((resolve, reject) => {
            let timeoutHandle = null;
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
            const onError = (err) => {
                cleanup();
                this.imap = null;
                reject(new Error(`Mail connection failed: ${(0, parseError_1.parseError)(err)}`));
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
            }
            catch (err) {
                cleanup();
                this.imap = null;
                reject(err);
            }
        }).finally(() => {
            this.connectPromise = null;
        });
        return this.connectPromise;
    }
    async disconnectFromMail() {
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
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled)
                        return;
                    settled = true;
                    imap.removeListener('end', finish);
                    imap.removeListener('error', finish);
                    resolve();
                };
                imap.once('end', finish);
                imap.once('error', finish);
                try {
                    imap.end();
                }
                catch (err) {
                    console.error('Error disconnecting from mail server:', (0, parseError_1.parseError)(err));
                    finish();
                    return;
                }
                setTimeout(finish, 5000);
            });
            console.log('Disconnected from mail server');
        }
        catch (err) {
            console.error('Error disconnecting from mail server:', (0, parseError_1.parseError)(err));
            throw err;
        }
    }
    async isMailReady() {
        return this.isReady;
    }
    async getCode(options = {}) {
        console.log('MailReady : ', this.isReady);
        if (!this.isReady || !this.imap) {
            throw new Error('Mail server is not ready');
        }
        try {
            await this.openInbox();
            const searchCriteria = [['FROM', 'noreply@telegram.org']];
            const fetchOptions = { bodies: ['TEXT'], markSeen: false };
            console.log('Inbox Opened');
            const results = await new Promise((resolve, reject) => {
                this.imap.search(searchCriteria, (err, foundResults) => {
                    if (err) {
                        console.error('Search error:', (0, parseError_1.parseError)(err));
                        reject(err);
                    }
                    else {
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
            const candidates = [];
            const fetch = this.imap.fetch(candidateIds, fetchOptions);
            await new Promise((resolve, reject) => {
                fetch.on('message', (msg, seqno) => {
                    let messageBody = '';
                    let receivedAt = null;
                    msg.on('body', (stream) => {
                        stream.on('data', (chunk) => {
                            messageBody += chunk.toString('utf8');
                        });
                    });
                    msg.once('attributes', (attrs) => {
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
                fetch.once('error', (err) => reject(err));
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
        }
        catch (error) {
            console.error('Error:', error);
            this.isReady = false;
            throw error;
        }
    }
    async openInbox() {
        await new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', false, (err) => {
                if (err) {
                    console.error('Open Inbox error:', (0, parseError_1.parseError)(err));
                    reject(err);
                }
                else {
                    console.log('Inbox opened');
                    resolve();
                }
            });
        });
    }
    async deleteMessage(seqno) {
        await new Promise((resolve, reject) => {
            this.imap.seq.addFlags([seqno], '\\Deleted', (flagError) => {
                if (flagError) {
                    reject(flagError);
                    return;
                }
                this.imap.expunge((expungeError) => {
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
exports.MailReader = MailReader;
//# sourceMappingURL=IMap.js.map
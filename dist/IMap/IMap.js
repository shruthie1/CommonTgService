"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailReader = void 0;
const imap_1 = __importDefault(require("imap"));
const utils_1 = require("../utils");
const parseError_1 = require("../utils/parseError");
class MailReader {
    constructor() {
        this.isReady = false;
        this.result = '';
        this.imap = new imap_1.default({
            user: process.env.GMAIL_ADD || '',
            password: process.env.GMAIL_PASS || '',
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        });
        this.imap.on('ready', () => {
            console.log('Mail is Ready');
            this.isReady = true;
        });
        this.imap.on('error', (err) => {
            console.error('SomeError:', err);
            this.isReady = false;
        });
        this.imap.on('end', () => {
            console.log('Connection ended');
            this.isReady = false;
        });
    }
    static getInstance() {
        if (!MailReader.instance) {
            MailReader.instance = new MailReader();
        }
        return MailReader.instance;
    }
    async connectToMail() {
        console.log('Connecting to mail server');
        try {
            this.imap.connect();
            this.isReady = true;
            console.log('Connected to mail server');
        }
        catch (err) {
            console.error('Error connecting to mail server:', (0, parseError_1.parseError)(err));
            throw err;
        }
    }
    async disconnectFromMail() {
        console.log('Disconnecting from mail server');
        try {
            this.imap.end();
            this.isReady = false;
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
    async getCode() {
        console.log("MailReady : ", this.isReady);
        if (!this.isReady) {
            console.log("Re-Connecting mail server");
            await this.connectToMail();
            await (0, utils_1.sleep)(10000);
        }
        try {
            await this.openInbox();
            const searchCriteria = [['FROM', 'noreply@telegram.org']];
            const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: true };
            console.log('Inbox Opened');
            const results = await new Promise((resolve, reject) => {
                this.imap.search(searchCriteria, (err, results) => {
                    if (err) {
                        console.error('Search error:', (0, parseError_1.parseError)(err));
                        reject(err);
                    }
                    else {
                        resolve(results);
                    }
                });
            });
            if (results.length > 0) {
                console.log('Emails found:', results.length);
                const length = results.length;
                const fetch = this.imap.fetch([results[length - 1]], fetchOptions);
                await new Promise((resolve, reject) => {
                    fetch.on('message', (msg, seqno) => {
                        const emailData = [];
                        msg.on('body', (stream, info) => {
                            let buffer = '';
                            stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
                            stream.on('end', () => {
                                if (info.which === 'TEXT') {
                                    emailData.push(buffer);
                                }
                                this.imap.seq.addFlags([seqno], '\\Deleted', (err) => {
                                    if (err)
                                        reject(err);
                                    this.imap.expunge((err) => {
                                        if (err)
                                            reject(err);
                                        console.log('Deleted message');
                                    });
                                });
                            });
                        });
                        msg.once('end', () => {
                            console.log(`Email #${seqno}, Latest ${results[length - 1]}`);
                            console.log('EmailDataLength:', emailData.length);
                            console.log('Mail:', emailData[emailData.length - 1].split('.'));
                            this.result = (0, utils_1.fetchNumbersFromString)(emailData[emailData.length - 1].split('.')[0]);
                            resolve();
                        });
                    });
                    fetch.once('end', () => {
                        console.log('Fetched mails');
                        resolve();
                    });
                });
            }
            else {
                console.log('No new emails found');
            }
            console.log('Returning result:', this.result);
            return this.result;
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
}
exports.MailReader = MailReader;
//# sourceMappingURL=IMap.js.map
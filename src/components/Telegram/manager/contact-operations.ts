import { Api } from 'telegram';
import * as fs from 'fs';
import bigInt from 'big-integer';
import { CustomFile } from 'telegram/client/uploads';
import { TgContext, ContactStats, ImportContactResult, BlockListResult } from './types';
import { generateCSV, generateVCard, createVCardContent } from './helpers';

function getFloodWaitSeconds(error: any): number | null {
    if (error?.seconds != null) return error.seconds;
    const match = error?.errorMessage?.match?.(/FLOOD_WAIT_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

export async function addContact(ctx: TgContext, data: { mobile: string; tgId: string }[], namePrefix: string): Promise<void> {
    try {
        for (let i = 0; i < data.length; i++) {
            const user = data[i];
            const firstName = `${namePrefix}${i + 1}`;
            try {
                await ctx.client.invoke(
                    new Api.contacts.AddContact({
                        firstName,
                        lastName: '',
                        phone: user.mobile,
                        id: user.tgId,
                    })
                );
            } catch (err) {
                const floodWait = getFloodWaitSeconds(err);
                if (floodWait != null) {
                    ctx.logger.warn(ctx.phoneNumber, `FLOOD_WAIT ${floodWait}s during addContact, stopping batch`);
                    break;
                }
                ctx.logger.info(ctx.phoneNumber, err);
            }
            if (i < data.length - 1) {
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
            }
        }
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error adding contacts:', error);
        const { parseError } = require('../../../utils/parseError');
        parseError(error, `Failed to save contacts`);
    }
}

export async function addContacts(ctx: TgContext, mobiles: string[], namePrefix: string): Promise<void> {
    try {
        const inputContacts: Api.TypeInputContact[] = [];
        for (let i = 0; i < mobiles.length; i++) {
            const user = mobiles[i];
            const firstName = `${namePrefix}${i + 1}`;
            const clientId = bigInt((i << 16 | 0).toString(10));
            inputContacts.push(new Api.InputPhoneContact({
                clientId, phone: user, firstName, lastName: '',
            }));
        }

        const result = await ctx.client.invoke(
            new Api.contacts.ImportContacts({ contacts: inputContacts })
        );
        ctx.logger.info(ctx.phoneNumber, 'Imported Contacts Result:', result);
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error adding contacts:', error);
        const { parseError } = require('../../../utils/parseError');
        parseError(error, `Failed to save contacts`);
    }
}

export async function getContacts(ctx: TgContext): Promise<Api.contacts.TypeContacts> {
    if (!ctx.client) throw new Error('Client is not initialized');
    try {
        return await ctx.client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting contacts:', error);
        throw error;
    }
}

export async function blockUser(ctx: TgContext, chatId: string): Promise<void> {
    try {
        await ctx.client?.invoke(new Api.contacts.Block({ id: chatId }));
        ctx.logger.info(ctx.phoneNumber, `User with ID ${chatId} has been blocked.`);
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Failed to block user:', error);
    }
}

export async function exportContacts(ctx: TgContext, format: 'vcard' | 'csv', includeBlocked: boolean = false): Promise<string> {
    if (!ctx.client) throw new Error('Client not initialized');

    const contactsResult = await ctx.client.invoke(new Api.contacts.GetContacts({}));
    const contacts = ('users' in contactsResult ? contactsResult.users : []) as Api.User[];

    let blockedContacts: Api.contacts.TypeBlocked | undefined;
    if (includeBlocked) {
        blockedContacts = await ctx.client.invoke(new Api.contacts.GetBlocked({ offset: 0, limit: 100 }));
    }

    if (format === 'csv') {
        const csvData = contacts.map((contact: Api.User) => ({
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            phone: contact.phone || '',
            blocked: blockedContacts && 'peerBlocked' in blockedContacts
                ? ((blockedContacts as Api.contacts.Blocked).blocked || []).some((p: Api.PeerBlocked) =>
                    (p.peerId instanceof Api.PeerUser) ? p.peerId.userId?.toString() === contact.id.toString() : false
                )
                : false,
        }));
        return generateCSV(csvData);
    } else {
        return generateVCard(contacts);
    }
}

export async function importContacts(ctx: TgContext, data: { firstName: string; lastName?: string; phone: string }[]): Promise<ImportContactResult[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const results: ImportContactResult[] = [];
    for (let i = 0; i < data.length; i++) {
        const contact = data[i];
        try {
            await ctx.client.invoke(new Api.contacts.ImportContacts({
                contacts: [new Api.InputPhoneContact({
                    clientId: bigInt(Math.floor(Math.random() * 1000000)),
                    phone: contact.phone,
                    firstName: contact.firstName,
                    lastName: contact.lastName || '',
                })],
            }));
            results.push({ success: true, phone: contact.phone });
        } catch (error) {
            const floodWait = getFloodWaitSeconds(error);
            if (floodWait != null) {
                ctx.logger.warn(ctx.phoneNumber, `FLOOD_WAIT ${floodWait}s during importContacts, stopping batch`);
                results.push({ success: false, phone: contact.phone, error: `FLOOD_WAIT_${floodWait}` });
                break;
            }
            results.push({ success: false, phone: contact.phone, error: error.message });
        }
        if (i < data.length - 1) {
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        }
    }

    return results;
}

export async function manageBlockList(ctx: TgContext, userIds: string[], block: boolean): Promise<BlockListResult[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const results: BlockListResult[] = [];
    for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        try {
            if (block) {
                await ctx.client.invoke(new Api.contacts.Block({ id: await ctx.client.getInputEntity(userId) }));
            } else {
                await ctx.client.invoke(new Api.contacts.Unblock({ id: await ctx.client.getInputEntity(userId) }));
            }
            results.push({ success: true, userId });
        } catch (error) {
            const floodWait = getFloodWaitSeconds(error);
            if (floodWait != null) {
                ctx.logger.warn(ctx.phoneNumber, `FLOOD_WAIT ${floodWait}s during ${block ? 'block' : 'unblock'}, stopping batch`);
                results.push({ success: false, userId, error: `FLOOD_WAIT_${floodWait}` });
                break;
            }
            results.push({ success: false, userId, error: error.message });
        }
        if (i < userIds.length - 1) {
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
        }
    }

    return results;
}

export async function getContactStatistics(ctx: TgContext): Promise<ContactStats> {
    if (!ctx.client) throw new Error('Client not initialized');

    const contactsResult = await ctx.client.invoke(new Api.contacts.GetContacts({}));
    const contacts = ('users' in contactsResult ? contactsResult.users : []) as Api.User[];

    const onlineContacts = contacts.filter((c: Api.User) => c.status && 'wasOnline' in c.status);

    return {
        total: contacts.length,
        online: onlineContacts.length,
        withPhone: contacts.filter((c: Api.User) => c.phone).length,
        mutual: contacts.filter((c: Api.User) => c.mutualContact).length,
        lastWeekActive: onlineContacts.filter((c: Api.User) => {
            const status = c.status as Api.UserStatusOffline;
            const lastSeen = new Date(status.wasOnline * 1000);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return lastSeen > weekAgo;
        }).length,
    };
}

export async function sendContactsFile(ctx: TgContext, chatId: string, contacts: Api.contacts.Contacts, filename: string = 'contacts.vcf'): Promise<void> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const vCardContent = createVCardContent(contacts);
        const tempPath = `./contacts/${chatId}-${filename}`;

        if (!fs.existsSync('./contacts')) {
            fs.mkdirSync('./contacts', { recursive: true });
        }

        fs.writeFileSync(tempPath, vCardContent, 'utf8');

        try {
            const fileContent = fs.readFileSync(tempPath);
            const file = new CustomFile(filename, fs.statSync(tempPath).size, tempPath, fileContent);
            await ctx.client.sendFile(chatId, {
                file,
                caption: `Contacts file with ${contacts.users.length} contacts`,
                forceDocument: true,
            });
            ctx.logger.info(ctx.phoneNumber, `Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending contacts file:', error);
        throw error;
    }
}

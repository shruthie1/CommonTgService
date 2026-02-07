import { Api } from 'telegram';
import * as fs from 'fs';
import bigInt from 'big-integer';
import { CustomFile } from 'telegram/client/uploads';
import { TgContext, ContactStats, ImportContactResult, BlockListResult } from './types';
import { generateCSV, generateVCard, createVCardContent } from './helpers';

export async function addContact(ctx: TgContext, data: { mobile: string; tgId: string }[], namePrefix: string): Promise<void> {
    try {
        const results = await Promise.allSettled(
            data.map(async (user, i) => {
                const firstName = `${namePrefix}${i + 1}`;
                await ctx.client.invoke(
                    new Api.contacts.AddContact({
                        firstName,
                        lastName: '',
                        phone: user.mobile,
                        id: user.tgId,
                    })
                );
            })
        );
        for (const result of results) {
            if (result.status === 'rejected') {
                ctx.logger.info(ctx.phoneNumber, result.reason);
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
                ? ((blockedContacts as Api.contacts.Blocked).blocked || []).some((p: any) =>
                    ('peerId' in p && p.peerId instanceof Api.PeerUser) ? p.peerId.userId?.toString() === contact.id.toString() : false
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

    const results = await Promise.all(data.map(async contact => {
        try {
            await ctx.client.invoke(new Api.contacts.ImportContacts({
                contacts: [new Api.InputPhoneContact({
                    clientId: bigInt(Math.floor(Math.random() * 1000000)),
                    phone: contact.phone,
                    firstName: contact.firstName,
                    lastName: contact.lastName || '',
                })],
            }));
            return { success: true, phone: contact.phone };
        } catch (error) {
            return { success: false, phone: contact.phone, error: error.message };
        }
    }));

    return results;
}

export async function manageBlockList(ctx: TgContext, userIds: string[], block: boolean): Promise<BlockListResult[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const results = await Promise.all(userIds.map(async userId => {
        try {
            if (block) {
                await ctx.client.invoke(new Api.contacts.Block({ id: await ctx.client.getInputEntity(userId) }));
            } else {
                await ctx.client.invoke(new Api.contacts.Unblock({ id: await ctx.client.getInputEntity(userId) }));
            }
            return { success: true, userId };
        } catch (error) {
            return { success: false, userId, error: error.message };
        }
    }));

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

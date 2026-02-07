"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addContact = addContact;
exports.addContacts = addContacts;
exports.getContacts = getContacts;
exports.blockUser = blockUser;
exports.exportContacts = exportContacts;
exports.importContacts = importContacts;
exports.manageBlockList = manageBlockList;
exports.getContactStatistics = getContactStatistics;
exports.sendContactsFile = sendContactsFile;
const telegram_1 = require("telegram");
const fs = __importStar(require("fs"));
const big_integer_1 = __importDefault(require("big-integer"));
const uploads_1 = require("telegram/client/uploads");
const helpers_1 = require("./helpers");
async function addContact(ctx, data, namePrefix) {
    try {
        const results = await Promise.allSettled(data.map(async (user, i) => {
            const firstName = `${namePrefix}${i + 1}`;
            await ctx.client.invoke(new telegram_1.Api.contacts.AddContact({
                firstName,
                lastName: '',
                phone: user.mobile,
                id: user.tgId,
            }));
        }));
        for (const result of results) {
            if (result.status === 'rejected') {
                ctx.logger.info(ctx.phoneNumber, result.reason);
            }
        }
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error adding contacts:', error);
        const { parseError } = require('../../../utils/parseError');
        parseError(error, `Failed to save contacts`);
    }
}
async function addContacts(ctx, mobiles, namePrefix) {
    try {
        const inputContacts = [];
        for (let i = 0; i < mobiles.length; i++) {
            const user = mobiles[i];
            const firstName = `${namePrefix}${i + 1}`;
            const clientId = (0, big_integer_1.default)((i << 16 | 0).toString(10));
            inputContacts.push(new telegram_1.Api.InputPhoneContact({
                clientId, phone: user, firstName, lastName: '',
            }));
        }
        const result = await ctx.client.invoke(new telegram_1.Api.contacts.ImportContacts({ contacts: inputContacts }));
        ctx.logger.info(ctx.phoneNumber, 'Imported Contacts Result:', result);
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error adding contacts:', error);
        const { parseError } = require('../../../utils/parseError');
        parseError(error, `Failed to save contacts`);
    }
}
async function getContacts(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        return await ctx.client.invoke(new telegram_1.Api.contacts.GetContacts({ hash: (0, big_integer_1.default)(0) }));
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting contacts:', error);
        throw error;
    }
}
async function blockUser(ctx, chatId) {
    try {
        await ctx.client?.invoke(new telegram_1.Api.contacts.Block({ id: chatId }));
        ctx.logger.info(ctx.phoneNumber, `User with ID ${chatId} has been blocked.`);
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Failed to block user:', error);
    }
}
async function exportContacts(ctx, format, includeBlocked = false) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const contactsResult = await ctx.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
    const contacts = ('users' in contactsResult ? contactsResult.users : []);
    let blockedContacts;
    if (includeBlocked) {
        blockedContacts = await ctx.client.invoke(new telegram_1.Api.contacts.GetBlocked({ offset: 0, limit: 100 }));
    }
    if (format === 'csv') {
        const csvData = contacts.map((contact) => ({
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            phone: contact.phone || '',
            blocked: blockedContacts && 'peerBlocked' in blockedContacts
                ? (blockedContacts.blocked || []).some((p) => ('peerId' in p && p.peerId instanceof telegram_1.Api.PeerUser) ? p.peerId.userId?.toString() === contact.id.toString() : false)
                : false,
        }));
        return (0, helpers_1.generateCSV)(csvData);
    }
    else {
        return (0, helpers_1.generateVCard)(contacts);
    }
}
async function importContacts(ctx, data) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const results = await Promise.all(data.map(async (contact) => {
        try {
            await ctx.client.invoke(new telegram_1.Api.contacts.ImportContacts({
                contacts: [new telegram_1.Api.InputPhoneContact({
                        clientId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000)),
                        phone: contact.phone,
                        firstName: contact.firstName,
                        lastName: contact.lastName || '',
                    })],
            }));
            return { success: true, phone: contact.phone };
        }
        catch (error) {
            return { success: false, phone: contact.phone, error: error.message };
        }
    }));
    return results;
}
async function manageBlockList(ctx, userIds, block) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const results = await Promise.all(userIds.map(async (userId) => {
        try {
            if (block) {
                await ctx.client.invoke(new telegram_1.Api.contacts.Block({ id: await ctx.client.getInputEntity(userId) }));
            }
            else {
                await ctx.client.invoke(new telegram_1.Api.contacts.Unblock({ id: await ctx.client.getInputEntity(userId) }));
            }
            return { success: true, userId };
        }
        catch (error) {
            return { success: false, userId, error: error.message };
        }
    }));
    return results;
}
async function getContactStatistics(ctx) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const contactsResult = await ctx.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
    const contacts = ('users' in contactsResult ? contactsResult.users : []);
    const onlineContacts = contacts.filter((c) => c.status && 'wasOnline' in c.status);
    return {
        total: contacts.length,
        online: onlineContacts.length,
        withPhone: contacts.filter((c) => c.phone).length,
        mutual: contacts.filter((c) => c.mutualContact).length,
        lastWeekActive: onlineContacts.filter((c) => {
            const status = c.status;
            const lastSeen = new Date(status.wasOnline * 1000);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return lastSeen > weekAgo;
        }).length,
    };
}
async function sendContactsFile(ctx, chatId, contacts, filename = 'contacts.vcf') {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const vCardContent = (0, helpers_1.createVCardContent)(contacts);
        const tempPath = `./contacts/${chatId}-${filename}`;
        if (!fs.existsSync('./contacts')) {
            fs.mkdirSync('./contacts', { recursive: true });
        }
        fs.writeFileSync(tempPath, vCardContent, 'utf8');
        try {
            const fileContent = fs.readFileSync(tempPath);
            const file = new uploads_1.CustomFile(filename, fs.statSync(tempPath).size, tempPath, fileContent);
            await ctx.client.sendFile(chatId, {
                file,
                caption: `Contacts file with ${contacts.users.length} contacts`,
                forceDocument: true,
            });
            ctx.logger.info(ctx.phoneNumber, `Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
        }
        finally {
            if (fs.existsSync(tempPath))
                fs.unlinkSync(tempPath);
        }
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending contacts file:', error);
        throw error;
    }
}
//# sourceMappingURL=contact-operations.js.map
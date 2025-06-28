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
exports.exportContacts = exportContacts;
exports.importContacts = importContacts;
exports.manageBlockList = manageBlockList;
exports.getContactStatistics = getContactStatistics;
exports.sendContactsFile = sendContactsFile;
const telegram_1 = require("telegram");
const uploads_1 = require("telegram/client/uploads");
const big_integer_1 = __importDefault(require("big-integer"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
function validatePhoneNumber(phone) {
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    return /^\+?\d{10,15}$/.test(cleanPhone);
}
function sanitizeFileName(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\.\./g, '_');
}
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let clientIdCounter = 1;
async function addContact(client, data, namePrefix) {
    try {
        const validContacts = data.filter(contact => {
            if (!validatePhoneNumber(contact.mobile)) {
                console.warn(`Invalid phone number: ${contact.mobile}`);
                return false;
            }
            return true;
        });
        if (validContacts.length === 0) {
            throw new Error('No valid phone numbers provided');
        }
        const contacts = validContacts.map((contact, index) => new telegram_1.Api.InputPhoneContact({
            clientId: (0, big_integer_1.default)(clientIdCounter + index),
            phone: contact.mobile,
            firstName: `${namePrefix}_${contact.mobile.slice(-4)}`,
            lastName: ""
        }));
        clientIdCounter += validContacts.length;
        const result = await client.invoke(new telegram_1.Api.contacts.ImportContacts({
            contacts
        }));
        console.log(`Added ${result.imported.length} contacts out of ${validContacts.length} provided`);
        return validContacts.map((contact, index) => ({
            success: index < result.imported.length,
            phone: contact.mobile,
            error: index >= result.imported.length ? 'Failed to import' : undefined
        }));
    }
    catch (error) {
        console.error('Error adding contacts:', error);
        throw error;
    }
}
async function addContacts(client, mobiles, namePrefix) {
    try {
        const validMobiles = mobiles.filter(mobile => {
            if (!validatePhoneNumber(mobile)) {
                console.warn(`Invalid phone number: ${mobile}`);
                return false;
            }
            return true;
        });
        if (validMobiles.length === 0) {
            throw new Error('No valid phone numbers provided');
        }
        const contacts = validMobiles.map((mobile, index) => new telegram_1.Api.InputPhoneContact({
            clientId: (0, big_integer_1.default)(clientIdCounter + index),
            phone: mobile,
            firstName: `${namePrefix}_${mobile.slice(-4)}`,
            lastName: ""
        }));
        clientIdCounter += validMobiles.length;
        const result = await client.invoke(new telegram_1.Api.contacts.ImportContacts({
            contacts
        }));
        console.log(`Successfully imported ${result.imported.length} contacts out of ${validMobiles.length}`);
        return validMobiles.map((mobile, index) => ({
            success: index < result.imported.length,
            phone: mobile,
            error: index >= result.imported.length ? 'Failed to import' : undefined
        }));
    }
    catch (error) {
        console.error('Error adding contacts:', error);
        throw error;
    }
}
async function exportContacts(client, format, includeBlocked = false) {
    const contactsResult = await client.invoke(new telegram_1.Api.contacts.GetContacts({}));
    const contacts = contactsResult?.contacts || [];
    let allBlockedContacts = [];
    if (includeBlocked) {
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        while (hasMore) {
            const blockedResult = await client.invoke(new telegram_1.Api.contacts.GetBlocked({
                offset,
                limit
            }));
            if (blockedResult.blocked && blockedResult.blocked.length > 0) {
                allBlockedContacts.push(...blockedResult.blocked);
                offset += blockedResult.blocked.length;
                hasMore = blockedResult.blocked.length === limit;
            }
            else {
                hasMore = false;
            }
        }
    }
    if (format === 'csv') {
        const csvData = contacts.map((contact) => ({
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            phone: contact.phone || '',
            blocked: allBlockedContacts.some((blocked) => blocked.peer_id?.user_id?.toString() === contact.id.toString())
        }));
        return generateCSV(csvData);
    }
    else {
        return generateVCard(contacts);
    }
}
async function importContacts(client, data) {
    const validContacts = data.filter(contact => {
        if (!validatePhoneNumber(contact.phone)) {
            console.warn(`Invalid phone number: ${contact.phone}`);
            return false;
        }
        return true;
    });
    if (validContacts.length === 0) {
        throw new Error('No valid contacts provided');
    }
    const batchSize = 10;
    const results = [];
    for (let i = 0; i < validContacts.length; i += batchSize) {
        const batch = validContacts.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (contact, index) => {
            try {
                await client.invoke(new telegram_1.Api.contacts.ImportContacts({
                    contacts: [new telegram_1.Api.InputPhoneContact({
                            clientId: (0, big_integer_1.default)(clientIdCounter + index),
                            phone: contact.phone,
                            firstName: contact.firstName,
                            lastName: contact.lastName || ''
                        })]
                }));
                return { success: true, phone: contact.phone };
            }
            catch (error) {
                return { success: false, phone: contact.phone, error: error.message };
            }
        }));
        clientIdCounter += batch.length;
        results.push(...batchResults);
        if (i + batchSize < validContacts.length) {
            await delay(1000);
        }
    }
    const successCount = results.filter(r => r.success).length;
    console.log(`Imported ${successCount} out of ${validContacts.length} contacts`);
    return results;
}
async function manageBlockList(client, userIds, block) {
    const batchSize = 5;
    const results = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (userId) => {
            try {
                if (block) {
                    await client.invoke(new telegram_1.Api.contacts.Block({
                        id: await client.getInputEntity(userId)
                    }));
                }
                else {
                    await client.invoke(new telegram_1.Api.contacts.Unblock({
                        id: await client.getInputEntity(userId)
                    }));
                }
                return { success: true, userId };
            }
            catch (error) {
                return { success: false, userId, error: error.message };
            }
        }));
        results.push(...batchResults);
        if (i + batchSize < userIds.length) {
            await delay(500);
        }
    }
    const successCount = results.filter(r => r.success).length;
    console.log(`${block ? 'Blocked' : 'Unblocked'} ${successCount} out of ${userIds.length} users`);
    return results;
}
async function getContactStatistics(client) {
    const contactsResult = await client.invoke(new telegram_1.Api.contacts.GetContacts({}));
    const contacts = contactsResult?.contacts || [];
    const onlineContacts = contacts.filter((c) => {
        if (!c.status)
            return false;
        return c.status.className === 'UserStatusOnline' ||
            c.status.className === 'UserStatusRecently' ||
            (c.status.className === 'UserStatusOffline' && 'wasOnline' in c.status);
    });
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const lastWeekActive = contacts.filter((c) => {
        if (!c.status || !c.status.wasOnline)
            return false;
        const lastSeen = new Date(c.status.wasOnline * 1000);
        return lastSeen > weekAgo;
    }).length;
    return {
        total: contacts.length,
        online: onlineContacts.length,
        withPhone: contacts.filter((c) => c.phone && c.phone.trim() !== '').length,
        mutual: contacts.filter((c) => c.mutual === true).length,
        lastWeekActive
    };
}
async function sendContactsFile(client, chatId, contacts, filename = 'contacts.vcf') {
    try {
        const vCardContent = createVCardContent(contacts);
        const sanitizedChatId = sanitizeFileName(chatId);
        const sanitizedFilename = sanitizeFileName(filename);
        const contactsDir = path.resolve('./contacts');
        const tempPath = path.join(contactsDir, `${sanitizedChatId}-${sanitizedFilename}`);
        await fs_1.promises.mkdir(contactsDir, { recursive: true });
        await fs_1.promises.writeFile(tempPath, vCardContent, 'utf8');
        try {
            const fileContent = await fs_1.promises.readFile(tempPath);
            const fileStats = await fs_1.promises.stat(tempPath);
            const file = new uploads_1.CustomFile(sanitizedFilename, fileStats.size, tempPath, fileContent);
            await client.sendFile(chatId, {
                file,
                caption: `Contacts file with ${contacts.users.length} contacts`,
                forceDocument: true
            });
            console.log(`Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
        }
        finally {
            try {
                await fs_1.promises.unlink(tempPath);
            }
            catch (unlinkError) {
                console.warn('Failed to clean up temp file:', unlinkError);
            }
        }
    }
    catch (error) {
        console.error('Error sending contacts file:', error);
        throw error;
    }
}
function generateCSV(contacts) {
    const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
    const rows = contacts.map(contact => [
        `"${contact.firstName.replace(/"/g, '""')}"`,
        `"${contact.lastName.replace(/"/g, '""')}"`,
        `"${contact.phone.replace(/"/g, '""')}"`,
        contact.blocked.toString()
    ].join(','));
    return [header, ...rows].join('\n');
}
function generateVCard(contacts) {
    return contacts.map(contact => {
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${contact.firstName} ${contact.lastName || ''}`.trim(),
            `TEL;TYPE=CELL:${contact.phone || ''}`,
            'END:VCARD'
        ];
        return vcard.join('\n');
    }).join('\n\n');
}
function createVCardContent(contacts) {
    const vCardParts = [];
    contacts.users.forEach((user) => {
        const typedUser = user;
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${(typedUser.firstName || '').trim()} ${(typedUser.lastName || '').trim()}`.trim(),
            `TEL;TYPE=CELL:${typedUser.phone || ''}`,
            'END:VCARD'
        ];
        vCardParts.push(vcard.join('\n'));
    });
    return vCardParts.join('\n\n');
}
//# sourceMappingURL=contact-management.js.map
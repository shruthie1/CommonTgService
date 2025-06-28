import { Api, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import bigInt from 'big-integer';
import { promises as fsAsync } from 'fs';
import * as path from 'path';

// Interfaces for better type safety
interface ContactData {
    mobile: string;
    tgId?: string;
}

interface ImportResult {
    success: boolean;
    phone: string;
    error?: string;
}

interface BlockListResult {
    success: boolean;
    userId: string;
    error?: string;
}

interface ContactStatistics {
    total: number;
    online: number;
    withPhone: number;
    mutual: number;
    lastWeekActive: number;
}

interface CSVContact {
    firstName: string;
    lastName: string;
    phone: string;
    blocked: boolean;
}

// Utility functions
function validatePhoneNumber(phone: string): boolean {
    // Remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    // Check if it's a valid phone number (10-15 digits, optionally starting with +)
    return /^\+?\d{10,15}$/.test(cleanPhone);
}

function sanitizeFileName(filename: string): string {
    // Remove or replace dangerous characters
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\.\./g, '_');
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let clientIdCounter = 1;

/**
 * Add contacts with proper error handling and validation
 */
export async function addContact(client: TelegramClient, data: ContactData[], namePrefix: string): Promise<ImportResult[]> {
    try {
        // Validate input data
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

        const contacts = validContacts.map((contact, index) =>
            new Api.InputPhoneContact({
                clientId: bigInt(clientIdCounter + index),
                phone: contact.mobile,
                firstName: `${namePrefix}_${contact.mobile.slice(-4)}`, // Use last 4 digits for consistency
                lastName: ""
            })
        );

        clientIdCounter += validContacts.length;

        const result = await client.invoke(new Api.contacts.ImportContacts({
            contacts
        }));

        console.log(`Added ${result.imported.length} contacts out of ${validContacts.length} provided`);

        // Return detailed results
        return validContacts.map((contact, index) => ({
            success: index < result.imported.length,
            phone: contact.mobile,
            error: index >= result.imported.length ? 'Failed to import' : undefined
        }));
    } catch (error) {
        console.error('Error adding contacts:', error);
        throw error;
    }
}

/**
 * Add multiple contacts with validation and consistent naming
 */
export async function addContacts(client: TelegramClient, mobiles: string[], namePrefix: string): Promise<ImportResult[]> {
    try {
        // Validate phone numbers
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

        const contacts = validMobiles.map((mobile, index) =>
            new Api.InputPhoneContact({
                clientId: bigInt(clientIdCounter + index),
                phone: mobile,
                firstName: `${namePrefix}_${mobile.slice(-4)}`, // Consistent with addContact
                lastName: ""
            })
        );

        clientIdCounter += validMobiles.length;

        const result = await client.invoke(new Api.contacts.ImportContacts({
            contacts
        }));

        console.log(`Successfully imported ${result.imported.length} contacts out of ${validMobiles.length}`);

        // Return detailed results
        return validMobiles.map((mobile, index) => ({
            success: index < result.imported.length,
            phone: mobile,
            error: index >= result.imported.length ? 'Failed to import' : undefined
        }));
    } catch (error) {
        console.error('Error adding contacts:', error);
        throw error;
    }
}

/**
 * Export contacts with pagination for blocked contacts
 */
export async function exportContacts(client: TelegramClient, format: 'vcard' | 'csv', includeBlocked: boolean = false): Promise<string> {
    const contactsResult: any = await client.invoke(new Api.contacts.GetContacts({}));
    const contacts = contactsResult?.contacts || [];

    let allBlockedContacts: any[] = [];
    if (includeBlocked) {
        // Fetch all blocked contacts with pagination
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const blockedResult = await client.invoke(new Api.contacts.GetBlocked({
                offset,
                limit
            }));

            if (blockedResult.blocked && blockedResult.blocked.length > 0) {
                allBlockedContacts.push(...blockedResult.blocked);
                offset += blockedResult.blocked.length;
                hasMore = blockedResult.blocked.length === limit;
            } else {
                hasMore = false;
            }
        }
    }

    if (format === 'csv') {
        const csvData: CSVContact[] = contacts.map((contact: any) => ({
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            phone: contact.phone || '',
            blocked: allBlockedContacts.some((blocked: any) =>
                blocked.peer_id?.user_id?.toString() === contact.id.toString()
            )
        }));
        return generateCSV(csvData);
    } else {
        return generateVCard(contacts);
    }
}

/**
 * Import contacts with batch processing and rate limiting
 */
export async function importContacts(client: TelegramClient, data: { firstName: string; lastName?: string; phone: string }[]): Promise<ImportResult[]> {
    // Validate input data
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

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    const results: ImportResult[] = [];

    for (let i = 0; i < validContacts.length; i += batchSize) {
        const batch = validContacts.slice(i, i + batchSize);

        const batchResults = await Promise.all(batch.map(async (contact, index) => {
            try {
                await client.invoke(new Api.contacts.ImportContacts({
                    contacts: [new Api.InputPhoneContact({
                        clientId: bigInt(clientIdCounter + index),
                        phone: contact.phone,
                        firstName: contact.firstName,
                        lastName: contact.lastName || ''
                    })]
                }));
                return { success: true, phone: contact.phone };
            } catch (error) {
                return { success: false, phone: contact.phone, error: (error as Error).message };
            }
        }));

        clientIdCounter += batch.length;
        results.push(...batchResults);

        // Add delay between batches to respect rate limits
        if (i + batchSize < validContacts.length) {
            await delay(1000);
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Imported ${successCount} out of ${validContacts.length} contacts`);

    return results;
}

/**
 * Manage block list with batch processing
 */
export async function manageBlockList(client: TelegramClient, userIds: string[], block: boolean): Promise<BlockListResult[]> {
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    const results: BlockListResult[] = [];

    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        const batchResults = await Promise.all(batch.map(async userId => {
            try {
                if (block) {
                    await client.invoke(new Api.contacts.Block({
                        id: await client.getInputEntity(userId)
                    }));
                } else {
                    await client.invoke(new Api.contacts.Unblock({
                        id: await client.getInputEntity(userId)
                    }));
                }
                return { success: true, userId };
            } catch (error) {
                return { success: false, userId, error: (error as Error).message };
            }
        }));

        results.push(...batchResults);

        // Add delay between batches
        if (i + batchSize < userIds.length) {
            await delay(500);
        }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`${block ? 'Blocked' : 'Unblocked'} ${successCount} out of ${userIds.length} users`);

    return results;
}

/**
 * Get contact statistics with improved status handling
 */
export async function getContactStatistics(client: TelegramClient): Promise<ContactStatistics> {
    const contactsResult: any = await client.invoke(new Api.contacts.GetContacts({}));
    const contacts = contactsResult?.contacts || [];

    // Better handling of different status types
    const onlineContacts = contacts.filter((c: any) => {
        if (!c.status) return false;
        return c.status.className === 'UserStatusOnline' ||
               c.status.className === 'UserStatusRecently' ||
               (c.status.className === 'UserStatusOffline' && 'wasOnline' in c.status);
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const lastWeekActive = contacts.filter((c: any) => {
        if (!c.status || !c.status.wasOnline) return false;
        const lastSeen = new Date(c.status.wasOnline * 1000);
        return lastSeen > weekAgo;
    }).length;

    return {
        total: contacts.length,
        online: onlineContacts.length,
        withPhone: contacts.filter((c: any) => c.phone && c.phone.trim() !== '').length,
        mutual: contacts.filter((c: any) => c.mutual === true).length,
        lastWeekActive
    };
}

/**
 * Send contacts file with async file operations and security improvements
 */
export async function sendContactsFile(client: TelegramClient, chatId: string, contacts: Api.contacts.Contacts, filename = 'contacts.vcf'): Promise<void> {
    try {
        const vCardContent = createVCardContent(contacts);
        const sanitizedChatId = sanitizeFileName(chatId);
        const sanitizedFilename = sanitizeFileName(filename);
        const contactsDir = path.resolve('./contacts');
        const tempPath = path.join(contactsDir, `${sanitizedChatId}-${sanitizedFilename}`);

        // Ensure the directory exists
        await fsAsync.mkdir(contactsDir, { recursive: true });

        // Write vCard content to a temporary file asynchronously
        await fsAsync.writeFile(tempPath, vCardContent, 'utf8');

        try {
            // Read the file content for sending
            const fileContent = await fsAsync.readFile(tempPath);
            const fileStats = await fsAsync.stat(tempPath);

            // Send file with the actual content
            const file = new CustomFile(
                sanitizedFilename,
                fileStats.size,
                tempPath,
                fileContent
            );

            await client.sendFile(chatId, {
                file,
                caption: `Contacts file with ${contacts.users.length} contacts`,
                forceDocument: true
            });

            console.log(`Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
        } finally {
            // Clean up temp file
            try {
                await fsAsync.unlink(tempPath);
            } catch (unlinkError) {
                console.warn('Failed to clean up temp file:', unlinkError);
            }
        }
    } catch (error) {
        console.error('Error sending contacts file:', error);
        throw error;
    }
}

// Helper functions
function generateCSV(contacts: CSVContact[]): string {
    const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
    const rows = contacts.map(contact => [
        `"${contact.firstName.replace(/"/g, '""')}"`, // Escape quotes in CSV
        `"${contact.lastName.replace(/"/g, '""')}"`,
        `"${contact.phone.replace(/"/g, '""')}"`,
        contact.blocked.toString()
    ].join(','));

    return [header, ...rows].join('\n');
}

function generateVCard(contacts: any[]): string {
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

function createVCardContent(contacts: Api.contacts.Contacts): string {
    const vCardParts: string[] = [];

    contacts.users.forEach((user: Api.TypeUser) => {
        const typedUser = user as Api.User;
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

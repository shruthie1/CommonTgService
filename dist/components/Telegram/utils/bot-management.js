"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotFatherTimeoutError = exports.BotCreationError = void 0;
exports.createBot = createBot;
exports.setBotCommands = setBotCommands;
exports.deleteBot = deleteBot;
exports.getBotInfo = getBotInfo;
exports.setBotProfilePhoto = setBotProfilePhoto;
exports.getUserBots = getUserBots;
const message_management_1 = require("./message-management");
const BOTFATHER_USERNAME = 'BotFather';
const DEFAULT_TIMEOUT = 10000;
const RATE_LIMIT_DELAY = 1000;
const RESPONSE_WAIT_TIME = 2000;
class BotCreationError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'BotCreationError';
    }
}
exports.BotCreationError = BotCreationError;
class BotFatherTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BotFatherTimeoutError';
    }
}
exports.BotFatherTimeoutError = BotFatherTimeoutError;
async function waitWithTimeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function validateBotOptions(options) {
    if (!options.name?.trim()) {
        throw new BotCreationError('Bot name is required and cannot be empty');
    }
    if (!options.username?.trim()) {
        throw new BotCreationError('Bot username is required and cannot be empty');
    }
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(options.username)) {
        throw new BotCreationError('Bot username must be 4-31 characters long, start with a letter, and contain only letters, numbers, and underscores');
    }
    if (options.description && options.description.length > 512) {
        throw new BotCreationError('Bot description cannot exceed 512 characters');
    }
    if (options.aboutText && options.aboutText.length > 120) {
        throw new BotCreationError('Bot about text cannot exceed 120 characters');
    }
    if (options.profilePhotoUrl && !isValidUrl(options.profilePhotoUrl)) {
        throw new BotCreationError('Invalid profile photo URL format');
    }
}
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
function generateUniqueUsername(baseUsername) {
    const cleanUsername = baseUsername.replace(/_bot$/, '');
    const timestamp = Date.now().toString(36).slice(-4);
    const random = Math.random().toString(36).substring(2, 5);
    const uniqueSuffix = `${timestamp}${random}`;
    return `${cleanUsername}_${uniqueSuffix}_bot`;
}
async function waitForBotFatherResponse(client, entity, expectedKeywords, timeoutMs = DEFAULT_TIMEOUT) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        await waitWithTimeout(RESPONSE_WAIT_TIME);
        try {
            const messages = await client.getMessages(entity, { limit: 3 });
            if (messages && messages.length > 0) {
                const latestMessage = messages[0].message.toLowerCase();
                if (expectedKeywords.some(keyword => latestMessage.includes(keyword.toLowerCase()))) {
                    return messages[0].message;
                }
                if (latestMessage.includes('sorry') || latestMessage.includes('error') || latestMessage.includes('invalid')) {
                    throw new BotCreationError(`BotFather error: ${messages[0].message}`);
                }
            }
        }
        catch (error) {
            if (error instanceof BotCreationError) {
                throw error;
            }
            console.warn(`[BOT CREATION] Error while waiting for response: ${error.message}`);
        }
    }
    throw new BotFatherTimeoutError(`Timeout waiting for BotFather response after ${timeoutMs}ms`);
}
async function createBot(client, options) {
    console.log(`[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);
    try {
        validateBotOptions(options);
        console.log('[BOT CREATION] Connecting to BotFather...');
        const entity = await client.getEntity(BOTFATHER_USERNAME);
        console.log('[BOT CREATION] Successfully connected to BotFather');
        console.log('[BOT CREATION] Sending /newbot command...');
        await client.sendMessage(entity, { message: '/newbot' });
        await waitForBotFatherResponse(client, entity, ['choose a name', 'name for your bot'], DEFAULT_TIMEOUT);
        console.log(`[BOT CREATION] Sending bot name: "${options.name}"`);
        await client.sendMessage(entity, { message: options.name });
        await waitForBotFatherResponse(client, entity, ['choose a username', 'username for your bot'], DEFAULT_TIMEOUT);
        const botUsername = generateUniqueUsername(options.username);
        console.log(`[BOT CREATION] Sending bot username: "${botUsername}"`);
        await client.sendMessage(entity, { message: botUsername });
        const tokenResponse = await waitForBotFatherResponse(client, entity, ['use this token', 'done! congratulations'], DEFAULT_TIMEOUT);
        const tokenMatch = tokenResponse.match(/(\d+:[A-Za-z0-9_-]{35})/);
        if (!tokenMatch) {
            console.error('[BOT CREATION] Could not extract bot token from response');
            throw new BotCreationError('Could not extract bot token from BotFather response');
        }
        const botToken = tokenMatch[0];
        console.log(`[BOT CREATION] Successfully extracted bot token: ${botToken.substring(0, 10)}...`);
        await setOptionalBotProperties(client, entity, botUsername, options);
        console.log(`[BOT CREATION] Bot creation completed successfully: @${botUsername}`);
        return {
            botToken,
            username: botUsername
        };
    }
    catch (error) {
        console.error(`[BOT CREATION] Error during bot creation process: ${error.message}`);
        if (error instanceof BotCreationError || error instanceof BotFatherTimeoutError) {
            throw error;
        }
        throw new BotCreationError(`Failed to create bot: ${error.message}`);
    }
}
async function setOptionalBotProperties(client, entity, botUsername, options) {
    if (options.description) {
        try {
            console.log('[BOT CREATION] Setting bot description...');
            await client.sendMessage(entity, { message: '/setdescription' });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendMessage(entity, { message: `@${botUsername}` });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendMessage(entity, { message: options.description });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            console.log('[BOT CREATION] Description set successfully');
        }
        catch (error) {
            console.warn(`[BOT CREATION] Failed to set description: ${error.message}`);
        }
    }
    if (options.aboutText) {
        try {
            console.log('[BOT CREATION] Setting about text...');
            await client.sendMessage(entity, { message: '/setabouttext' });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendMessage(entity, { message: `@${botUsername}` });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendMessage(entity, { message: options.aboutText });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            console.log('[BOT CREATION] About text set successfully');
        }
        catch (error) {
            console.warn(`[BOT CREATION] Failed to set about text: ${error.message}`);
        }
    }
    if (options.profilePhotoUrl) {
        try {
            console.log(`[BOT CREATION] Setting profile photo from URL: ${options.profilePhotoUrl}`);
            const photoBuffer = await (0, message_management_1.downloadFileFromUrl)(options.profilePhotoUrl);
            if (photoBuffer.length > 10 * 1024 * 1024) {
                throw new Error('Profile photo file too large (max 10MB)');
            }
            console.log(`[BOT CREATION] Photo downloaded successfully, size: ${photoBuffer.length} bytes`);
            await client.sendMessage(entity, { message: '/setuserpic' });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendMessage(entity, { message: `@${botUsername}` });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            await client.sendFile(entity, {
                file: Buffer.from(photoBuffer),
                caption: '',
                forceDocument: false
            });
            await waitWithTimeout(RATE_LIMIT_DELAY);
            console.log('[BOT CREATION] Profile photo set successfully');
        }
        catch (error) {
            console.warn(`[BOT CREATION] Failed to set profile photo: ${error.message}`);
        }
    }
}
async function setBotCommands(client, botUsername, commands) {
    if (!botUsername?.trim()) {
        throw new BotCreationError('Bot username is required');
    }
    if (!commands || commands.length === 0) {
        throw new BotCreationError('At least one command is required');
    }
    for (const cmd of commands) {
        if (!cmd.command?.trim() || !cmd.description?.trim()) {
            throw new BotCreationError('Command name and description are required');
        }
        if (!cmd.command.startsWith('/')) {
            cmd.command = '/' + cmd.command;
        }
        if (cmd.command.length > 32) {
            throw new BotCreationError('Command name cannot exceed 32 characters');
        }
        if (cmd.description.length > 256) {
            throw new BotCreationError('Command description cannot exceed 256 characters');
        }
    }
    try {
        const entity = await client.getEntity(BOTFATHER_USERNAME);
        await client.sendMessage(entity, { message: '/setcommands' });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        await client.sendMessage(entity, { message: `@${botUsername}` });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        const commandsText = commands.map(cmd => `${cmd.command} - ${cmd.description}`).join('\n');
        await client.sendMessage(entity, { message: commandsText });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        console.log(`[BOT COMMANDS] Set ${commands.length} commands for bot @${botUsername}`);
    }
    catch (error) {
        console.error(`[BOT COMMANDS] Failed to set commands for bot @${botUsername}:`, error);
        throw new BotCreationError(`Failed to set bot commands: ${error.message}`);
    }
}
async function deleteBot(client, botUsername) {
    if (!botUsername?.trim()) {
        throw new BotCreationError('Bot username is required');
    }
    try {
        const entity = await client.getEntity(BOTFATHER_USERNAME);
        await client.sendMessage(entity, { message: '/deletebot' });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        await client.sendMessage(entity, { message: `@${botUsername}` });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        await client.sendMessage(entity, { message: 'Yes, I am totally sure.' });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        console.log(`[BOT DELETION] Bot @${botUsername} deletion initiated`);
    }
    catch (error) {
        console.error(`[BOT DELETION] Failed to delete bot @${botUsername}:`, error);
        throw new BotCreationError(`Failed to delete bot: ${error.message}`);
    }
}
async function getBotInfo(client, botUsername) {
    if (!botUsername?.trim()) {
        throw new BotCreationError('Bot username is required');
    }
    try {
        const bot = await client.getEntity(botUsername);
        if (!bot) {
            throw new BotCreationError(`Bot @${botUsername} not found`);
        }
        return {
            id: bot.id.toString(),
            username: bot.username || '',
            firstName: bot.firstName || '',
            lastName: bot.lastName || undefined,
            isBot: bot.bot || false,
            canJoinGroups: bot.botChatHistory || false,
            canReadAllGroupMessages: bot.botNochats || false,
            supportsInlineQueries: bot.botInlinePlaceholder ? true : false
        };
    }
    catch (error) {
        console.error(`[BOT INFO] Failed to get info for bot @${botUsername}:`, error);
        throw new BotCreationError(`Failed to get bot information: ${error.message}`);
    }
}
async function setBotProfilePhoto(client, botUsername, photoUrl) {
    if (!botUsername?.trim()) {
        throw new BotCreationError('Bot username is required');
    }
    if (!photoUrl?.trim() || !isValidUrl(photoUrl)) {
        throw new BotCreationError('Valid photo URL is required');
    }
    try {
        const entity = await client.getEntity(BOTFATHER_USERNAME);
        const photoBuffer = await (0, message_management_1.downloadFileFromUrl)(photoUrl);
        if (photoBuffer.length > 10 * 1024 * 1024) {
            throw new BotCreationError('Profile photo file too large (max 10MB)');
        }
        await client.sendMessage(entity, { message: '/setuserpic' });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        await client.sendMessage(entity, { message: `@${botUsername}` });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        await client.sendFile(entity, {
            file: Buffer.from(photoBuffer),
            caption: '',
            forceDocument: false
        });
        await waitWithTimeout(RATE_LIMIT_DELAY);
        console.log(`[BOT PHOTO] Profile photo set for bot @${botUsername}`);
    }
    catch (error) {
        console.error(`[BOT PHOTO] Failed to set profile photo for bot @${botUsername}:`, error);
        throw new BotCreationError(`Failed to set profile photo: ${error.message}`);
    }
}
async function getUserBots(client) {
    try {
        const entity = await client.getEntity(BOTFATHER_USERNAME);
        await client.sendMessage(entity, { message: '/mybots' });
        await waitWithTimeout(RESPONSE_WAIT_TIME);
        const messages = await client.getMessages(entity, { limit: 1 });
        if (!messages || messages.length === 0) {
            console.log('[USER BOTS] No response from BotFather');
            return [];
        }
        const responseMessage = messages[0].message;
        console.log(`[USER BOTS] BotFather response received`);
        const botMatches = responseMessage.match(/@(\w+_bot)/g);
        if (!botMatches) {
            console.log('[USER BOTS] No bots found in response');
            return [];
        }
        const bots = botMatches.map(match => {
            const username = match.substring(1);
            return {
                username,
                name: username.replace(/_bot$/, ''),
                token: undefined
            };
        });
        console.log(`[USER BOTS] Found ${bots.length} bots`);
        return bots;
    }
    catch (error) {
        console.error('[USER BOTS] Failed to get user bots:', error);
        throw new BotCreationError(`Failed to get user bots: ${error.message}`);
    }
}
//# sourceMappingURL=bot-management.js.map
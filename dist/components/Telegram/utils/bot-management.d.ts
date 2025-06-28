import { TelegramClient } from 'telegram';
export declare class BotCreationError extends Error {
    readonly code?: string;
    constructor(message: string, code?: string);
}
export declare class BotFatherTimeoutError extends Error {
    constructor(message: string);
}
export declare function createBot(client: TelegramClient, options: {
    name: string;
    username: string;
    description?: string;
    aboutText?: string;
    profilePhotoUrl?: string;
}): Promise<{
    botToken: string;
    username: string;
}>;
export declare function setBotCommands(client: TelegramClient, botUsername: string, commands: Array<{
    command: string;
    description: string;
}>): Promise<void>;
export declare function deleteBot(client: TelegramClient, botUsername: string): Promise<void>;
export declare function getBotInfo(client: TelegramClient, botUsername: string): Promise<{
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    isBot: boolean;
    canJoinGroups: boolean;
    canReadAllGroupMessages: boolean;
    supportsInlineQueries: boolean;
}>;
export declare function setBotProfilePhoto(client: TelegramClient, botUsername: string, photoUrl: string): Promise<void>;
export declare function getUserBots(client: TelegramClient): Promise<Array<{
    username: string;
    name: string;
    token?: string;
}>>;

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessageEvent } from 'telegram/events';
import { TgContext } from './types';
export declare function createClient(ctx: TgContext, session: StringSession, handler?: boolean, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<{
    client: TelegramClient;
    apiId: number;
    apiHash: string;
}>;
export declare function destroyClient(ctx: TgContext, session: StringSession): Promise<void>;
export declare function handleClientError(ctx: TgContext, error: Error): NodeJS.Timeout | null;
export declare function handleIncomingEvent(ctx: TgContext, event: NewMessageEvent): Promise<void>;

import { Api } from 'telegram';
export declare function normalizeChatId(id: string | number | bigint): string;
export declare function expandChatIdVariants(id: string | number | bigint): string[];
export declare function isChannelOrGroupEntity(entity: unknown): entity is Api.Channel | Api.Chat;

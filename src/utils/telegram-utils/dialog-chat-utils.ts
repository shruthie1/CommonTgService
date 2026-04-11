import { Api } from 'telegram';

export function normalizeChatId(id: string | number | bigint): string {
    return id.toString().replace(/^-100/, '');
}

export function expandChatIdVariants(id: string | number | bigint): string[] {
    const normalized = normalizeChatId(id);
    return [normalized, `-100${normalized}`];
}

export function isChannelOrGroupEntity(entity: unknown): entity is Api.Channel | Api.Chat {
    return entity instanceof Api.Channel || entity instanceof Api.Chat;
}

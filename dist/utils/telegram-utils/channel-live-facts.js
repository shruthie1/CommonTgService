"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramChannelLiveFacts = getTelegramChannelLiveFacts;
exports.normalizeTelegramChannelId = normalizeTelegramChannelId;
async function getTelegramChannelLiveFacts(client, input) {
    const channelId = normalizeTelegramChannelId(input.channelId);
    if (!channelId)
        return null;
    const entity = input.entity ?? await client.getEntity(input.peer ?? `-100${channelId}`);
    if (!isRecord(entity))
        return null;
    const forbiddenEntity = isForbiddenEntity(entity);
    const sendMessages = readBoolean(entity.defaultBannedRights, 'sendMessages') || readBoolean(entity, 'sendMessages');
    const sendPlain = readBoolean(entity.defaultBannedRights, 'sendPlain') || readBoolean(entity, 'sendPlain');
    const facts = {
        channelId,
        title: readString(entity, 'title'),
        username: readString(entity, 'username'),
        participantsCount: await resolveParticipantsCount(entity, channelId, input.resolveParticipantsCount),
        broadcast: readBoolean(entity, 'broadcast'),
        restricted: readBoolean(entity, 'restricted'),
        left: readBoolean(entity, 'left'),
        private: readBoolean(entity, 'private') || forbiddenEntity,
        forbidden: readBoolean(entity, 'forbidden') || forbiddenEntity,
        megagroup: readBoolean(entity, 'megagroup'),
        sendMessages,
        sendPlain,
        canSendMsgs: false,
    };
    facts.canSendMsgs = !facts.broadcast
        && !facts.restricted
        && !facts.left
        && !facts.private
        && !facts.forbidden
        && !facts.sendMessages
        && !facts.sendPlain;
    return facts;
}
function normalizeTelegramChannelId(input) {
    const normalized = String(input ?? '').trim().replace(/^-100/, '').replace(/^-/, '');
    return /^\d+$/.test(normalized) && normalized !== '0' ? normalized : '';
}
async function resolveParticipantsCount(entity, channelId, resolver) {
    const resolved = resolver ? await resolver(entity, channelId) : undefined;
    return normalizeNonNegativeInteger(resolved) ?? normalizeNonNegativeInteger(entity.participantsCount);
}
function normalizeNonNegativeInteger(input) {
    if (typeof input === 'number' && Number.isFinite(input) && input >= 0)
        return Math.floor(input);
    if (typeof input === 'string' && input.trim()) {
        const parsed = Number(input);
        if (Number.isFinite(parsed) && parsed >= 0)
            return Math.floor(parsed);
    }
    return null;
}
function readBoolean(source, key) {
    return isRecord(source) && source[key] === true;
}
function readString(source, key) {
    const value = source[key];
    if (value === null || value === undefined)
        return null;
    const normalized = String(value).trim();
    return normalized || null;
}
function isForbiddenEntity(entity) {
    const className = readString(entity, 'className') || entity.constructor?.name || '';
    return className === 'ChannelForbidden' || className === 'ChatForbidden';
}
function isRecord(input) {
    return input !== null && typeof input === 'object';
}
//# sourceMappingURL=channel-live-facts.js.map
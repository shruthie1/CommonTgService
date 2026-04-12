"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEGATIVE_KEYWORDS = exports.INTIMATE_KEYWORDS = void 0;
exports.scoreRelationship = scoreRelationship;
exports.rankRelationships = rankRelationships;
exports.computeAccountScore = computeAccountScore;
exports.INTIMATE_KEYWORDS = [
    'love', 'luv',
    'kiss',
    'sex',
    'baby', 'babe',
    'fuck',
    'boobs',
    'dick',
    'password',
    'email',
    'otp',
    'username',
    'pussy',
    'hug',
];
exports.NEGATIVE_KEYWORDS = [
    'movie', 'season', 'episode',
    'download', 'torrent', 'dubbed',
    'subtitle', 'series', 'webseries',
    '720p', '1080p', 'hdcam',
    'telegram.me', 't.me/',
];
function scoreRelationship(chat) {
    const { messages, mediaCount, voiceCount, intimateMessageCount, negativeKeywordCount, calls, commonChats, isMutualContact, lastMessageDate } = chat;
    const msgScore = Math.min(messages, 3000) * 1.0;
    const mediaScore = Math.min(mediaCount, 300) * 3.0;
    const voiceScore = Math.min(voiceCount, 100) * 4.0;
    const hasIncoming = calls.incoming > 0;
    const outgoing = calls.total - calls.incoming;
    const bidirectionalBonus = hasIncoming && outgoing > 0
        ? Math.min(outgoing, calls.incoming) * 2.0
        : 0;
    const meaningfulCallScore = Math.min(calls.meaningfulCalls, 100) * 15.0;
    const callScore = hasIncoming
        ? calls.incoming * 8.0 +
            bidirectionalBonus +
            calls.videoCalls * 12.0 +
            meaningfulCallScore +
            Math.min(calls.totalDuration, 36000) * 0.02
        : 0;
    const intimateScore = Math.min(intimateMessageCount, 500) * 20.0;
    const negativePenalty = Math.min(negativeKeywordCount, 200) * 8.0;
    const mutualScore = isMutualContact ? 50 : 0;
    const commonChatScore = Math.min(commonChats, 10) * 15.0;
    const daysSinceLastMessage = lastMessageDate
        ? (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
    const recencyBonus = daysSinceLastMessage <= 90
        ? 100 * (1 - daysSinceLastMessage / 90)
        : 0;
    const raw = msgScore + mediaScore + voiceScore + callScore +
        intimateScore + mutualScore + commonChatScore + recencyBonus - negativePenalty;
    return Math.max(0, Math.round(raw));
}
function rankRelationships(candidates, topN = 5) {
    return candidates
        .map(c => ({ ...c, score: scoreRelationship(c) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}
function computeAccountScore(topRelationships) {
    return topRelationships.slice(0, 3).reduce((sum, r) => sum + r.score, 0);
}
//# sourceMappingURL=relationship-scorer.js.map
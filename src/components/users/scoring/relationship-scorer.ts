export const INTIMATE_KEYWORDS = [
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
  'hug'
];

export interface RelationshipCandidate {
  chatId: string;
  name: string;
  username: string | null;
  phone: string | null;
  messages: number;
  mediaCount: number;
  voiceCount: number;
  intimateMessageCount: number;
  calls: {
    total: number;
    incoming: number;
    videoCalls: number;
    avgDuration: number;
    totalDuration: number;
  };
  commonChats: number;
  isMutualContact: boolean;
  lastMessageDate: string | null;
}

export interface ScoredRelationship extends RelationshipCandidate {
  score: number;
}

export function scoreRelationship(chat: RelationshipCandidate): number {
  const { messages, mediaCount, voiceCount, intimateMessageCount, calls, commonChats, isMutualContact, lastMessageDate } = chat;

  const msgScore = Math.min(messages, 3000) * 1.0;
  const mediaScore = Math.min(mediaCount, 300) * 3.0;
  const voiceScore = Math.min(voiceCount, 100) * 4.0;

  // Calls only count as relationship signal if there are incoming calls (they call you).
  // Outgoing-only calls = 0 (could be automated/spam/business).
  // When bidirectional, outgoing adds a small bonus scaled by the incoming ratio.
  const hasIncoming = calls.incoming > 0;
  const outgoing = calls.total - calls.incoming;
  const bidirectionalBonus = hasIncoming && outgoing > 0
    ? Math.min(outgoing, calls.incoming) * 2.0  // capped at incoming count
    : 0;
  const callScore = hasIncoming
    ? calls.incoming * 8.0 +
      bidirectionalBonus +
      calls.videoCalls * 12.0 +
      Math.min(calls.totalDuration, 36000) * 0.02 +
      Math.min(calls.avgDuration, 1800) * 0.1
    : 0;

  const intimateScore = Math.min(intimateMessageCount, 500) * 10.0;

  const mutualScore = isMutualContact ? 50 : 0;
  const commonChatScore = Math.min(commonChats, 10) * 15.0;

  const daysSinceLastMessage = lastMessageDate
    ? (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  const recencyBonus = daysSinceLastMessage <= 90
    ? 100 * (1 - daysSinceLastMessage / 90)
    : 0;

  return Math.round(
    msgScore + mediaScore + voiceScore + callScore +
    intimateScore + mutualScore + commonChatScore + recencyBonus
  );
}

export function rankRelationships(candidates: RelationshipCandidate[], topN: number = 5): ScoredRelationship[] {
  return candidates
    .map(c => ({ ...c, score: scoreRelationship(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function computeAccountScore(topRelationships: ScoredRelationship[]): number {
  return topRelationships.slice(0, 3).reduce((sum, r) => sum + r.score, 0);
}

export declare const INTIMATE_KEYWORDS: string[];
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
export declare function scoreRelationship(chat: RelationshipCandidate): number;
export declare function rankRelationships(candidates: RelationshipCandidate[], topN?: number): ScoredRelationship[];
export declare function computeAccountScore(topRelationships: ScoredRelationship[]): number;

export declare class ConnectionStatusDto {
    activeConnections: number;
    rateLimited: number;
    totalOperations: number;
}
export declare class ChatStatisticsDto {
    totalMessages: number;
    activeMembers: number;
    messageTypes: {
        text: number;
        photo: number;
        video: number;
        voice: number;
        document: number;
    };
    activeHours: number[];
    activityTrend: number;
}

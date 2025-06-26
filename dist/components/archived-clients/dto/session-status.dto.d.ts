export declare class SessionHealthMetricsDto {
    activeOldSessions: number;
    lastUpdated: string;
    sessionAge: string;
    reliability: 'high' | 'medium' | 'low';
}
export declare class SessionStatusDto {
    mobile: string;
    isMainSessionActive: boolean;
    totalOldSessions: number;
    lastChecked: string;
    healthMetrics: SessionHealthMetricsDto;
}

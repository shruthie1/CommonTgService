export declare class AcceptedStringResponseDto {
    message: string;
}
export declare class StatusUpdateRequestDto {
    status: 'active' | 'inactive';
    message?: string;
}
export declare class ActivationRequestDto {
    message?: string;
}
export declare class DeactivationRequestDto {
    reason: string;
}
export declare class MarkUsedRequestDto {
    message?: string;
}
export declare class BulkEnrollClientsRequestDto {
    goodIds: string[];
    badIds: string[];
}
export declare class BulkEnrollBufferClientsRequestDto extends BulkEnrollClientsRequestDto {
    clientsNeedingBufferClients?: string[];
}
export declare class BulkEnrollPromoteClientsRequestDto extends BulkEnrollClientsRequestDto {
    clientsNeedingPromoteClients?: string[];
}
export declare class UsageStatisticsDto {
    totalClients: number;
    neverUsed: number;
    usedInLast24Hours: number;
    usedInLastWeek: number;
    averageUsageGap: number;
}

import { DailyAnalyticsService } from './daily-analytics.service';
export declare class DailyAnalyticsController {
    private readonly service;
    constructor(service: DailyAnalyticsService);
    overview(days?: string): Promise<{
        days: number;
        promote: Record<string, unknown>[];
        reaction: Record<string, unknown>[];
        user: Record<string, unknown>[];
    }>;
    daily(metric: string, days?: string): Promise<Record<string, unknown>[]>;
    byClient(metric: string, days?: string, namespace?: string): Promise<Record<string, unknown>[]>;
    byMobile(metric: string, days?: string, clientId?: string, namespace?: string): Promise<Record<string, unknown>[]>;
    rows(metric: string, days?: string, clientId?: string, namespace?: string, mobile?: string): Promise<any[]>;
}

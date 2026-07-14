import { Model } from 'mongoose';
import { PromoteStatDailyDocument, ReactionStatDailyDocument, UserStatDailyDocument } from './schemas/daily-analytics.schema';
export type DailyMetric = 'promote' | 'reaction' | 'user';
export declare class DailyAnalyticsService {
    private promoteModel;
    private reactionModel;
    private userModel;
    constructor(promoteModel: Model<PromoteStatDailyDocument>, reactionModel: Model<ReactionStatDailyDocument>, userModel: Model<UserStatDailyDocument>);
    private modelFor;
    private numericFields;
    private lastNDates;
    rows(metric: DailyMetric, days?: number, clientId?: string): Promise<any[]>;
    dailyTotals(metric: DailyMetric, days?: number): Promise<Record<string, unknown>[]>;
    byClient(metric: DailyMetric, days?: number): Promise<Record<string, unknown>[]>;
    overview(days?: number): Promise<{
        days: number;
        promote: Record<string, unknown>[];
        reaction: Record<string, unknown>[];
        user: Record<string, unknown>[];
    }>;
}

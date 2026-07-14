import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PromoteStatDaily,
  PromoteStatDailyDocument,
  ReactionStatDaily,
  ReactionStatDailyDocument,
  UserStatDaily,
  UserStatDailyDocument,
} from './schemas/daily-analytics.schema';

export type DailyMetric = 'promote' | 'reaction' | 'user';

/**
 * Read-only access to the TTL-based daily analytics collections that the promote-clients and
 * tg-aut services write. Powers the dashboard: per-day trends, per-client breakdowns, and
 * fleet-wide totals. Never writes (the services own the writes).
 */
@Injectable()
export class DailyAnalyticsService {
  constructor(
    @InjectModel(PromoteStatDaily.name) private promoteModel: Model<PromoteStatDailyDocument>,
    @InjectModel(ReactionStatDaily.name) private reactionModel: Model<ReactionStatDailyDocument>,
    @InjectModel(UserStatDaily.name) private userModel: Model<UserStatDailyDocument>,
  ) {}

  private modelFor(metric: DailyMetric): Model<any> {
    if (metric === 'reaction') return this.reactionModel;
    if (metric === 'user') return this.userModel;
    return this.promoteModel;
  }

  private numericFields(metric: DailyMetric): string[] {
    if (metric === 'reaction') return ['success', 'failed', 'restricted', 'floods'];
    if (metric === 'user') return ['newUsers', 'active', 'paid', 'revenue'];
    return ['sent', 'success', 'failed', 'banned'];
  }

  /** Last N days as "YYYY-MM-DD" (IST), oldest first — for filling gaps in trend responses. */
  private lastNDates(days: number): string[] {
    const out: string[] = [];
    const n = Math.min(Math.max(Math.floor(days) || 1, 1), 60);
    for (let i = n - 1; i >= 0; i -= 1) {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000);
      out.push(ist.toISOString().slice(0, 10));
    }
    return out;
  }

  /** Raw daily rows for a metric, optionally filtered by client/namespace/mobile, over the last N days. */
  async rows(metric: DailyMetric, days = 14, clientId?: string, namespace?: string, mobile?: string) {
    const dates = this.lastNDates(days);
    const filter: Record<string, unknown> = { date: { $in: dates } };
    if (clientId) filter.clientId = clientId;
    if (namespace) filter.namespace = namespace;
    if (mobile) filter.mobile = mobile;
    return this.modelFor(metric)
      .find(filter, { _id: 0, expireAt: 0, createdAt: 0 })
      .sort({ date: 1, clientId: 1 })
      .lean()
      .exec();
  }

  /** Per-day fleet totals for a metric (summed across all clients), gap-filled with zeroes. */
  async dailyTotals(metric: DailyMetric, days = 14) {
    const dates = this.lastNDates(days);
    const fields = this.numericFields(metric);
    const group: Record<string, unknown> = { _id: '$date' };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([{ $match: { date: { $in: dates } } }, { $group: group }, { $sort: { _id: 1 } }] as any[])
      .exec();
    const byDate = new Map(agg.map((d: any) => [d._id, d]));
    return dates.map((date) => {
      const row = byDate.get(date) || {};
      const out: Record<string, unknown> = { date };
      for (const f of fields) out[f] = (row as any)[f] || 0;
      return out;
    });
  }

  /** Per-client totals for a metric over the last N days (leaderboard/table view). */
  async byClient(metric: DailyMetric, days = 14, namespace?: string) {
    const dates = this.lastNDates(days);
    const fields = this.numericFields(metric);
    const match: Record<string, unknown> = { date: { $in: dates } };
    if (namespace) match.namespace = namespace;
    const group: Record<string, unknown> = { _id: '$clientId' };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([{ $match: match }, { $group: group }, { $sort: { _id: 1 } }] as any[])
      .exec();
    return agg.map((d: any) => {
      const out: Record<string, unknown> = { clientId: d._id };
      for (const f of fields) out[f] = d[f] || 0;
      return out;
    });
  }

  /**
   * Per-mobile totals for a metric over the last N days — the per-mobile breakdown view.
   * promote-clients runs MANY mobiles per clientId, so this is the only way to see e.g. which
   * mobile under a clientId is failing (real example: meghana1 sent=75 failed=72 blended across
   * mobiles before this dimension existed). Optionally scoped to one clientId and/or namespace.
   */
  async byMobile(metric: DailyMetric, days = 14, clientId?: string, namespace?: string) {
    const dates = this.lastNDates(days);
    const fields = this.numericFields(metric);
    const match: Record<string, unknown> = { date: { $in: dates } };
    if (clientId) match.clientId = clientId;
    if (namespace) match.namespace = namespace;
    const group: Record<string, unknown> = { _id: { clientId: '$clientId', mobile: '$mobile' } };
    for (const f of fields) group[f] = { $sum: `$${f}` };
    const agg = await this.modelFor(metric)
      .aggregate([
        { $match: match },
        { $group: group },
        { $sort: { '_id.clientId': 1, '_id.mobile': 1 } },
      ] as any[])
      .exec();
    return agg.map((d: any) => {
      const out: Record<string, unknown> = { clientId: d._id.clientId, mobile: d._id.mobile };
      for (const f of fields) out[f] = d[f] || 0;
      return out;
    });
  }

  /** Combined dashboard overview: fleet daily totals for all three metrics in one call. */
  async overview(days = 14) {
    const [promote, reaction, user] = await Promise.all([
      this.dailyTotals('promote', days),
      this.dailyTotals('reaction', days),
      this.dailyTotals('user', days),
    ]);
    return { days, promote, reaction, user };
  }
}

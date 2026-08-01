import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

/** Shape returned by {@link ChannelIntelligenceReadService.getOutcomeAnalytics}. */
export interface ChannelIntelligenceOutcomeAnalytics {
  messageStats: {
    totalSent: number;
    totalFailed: number;
    totalDeleted: number;
    successRate: number;
    channelsWithSends: number;
    channelsWithFailures: number;
    channelsWithDeleted: number;
    avgSent: number;
    avgFailed: number;
  };
  restrictionStats: {
    freeformDeletionChannels: number;
    followUpDeletionChannels: number;
    totalFreeformDeletions: number;
    totalFollowUpDeletions: number;
  };
  successRateDistribution: { range: string; count: number }[];
  topBySuccess: any[];
  topByFailure: any[];
  topByDeleted: any[];
}

// ─── Conversion-aware join-sort tuning (see spec 2026-08-01-conversion-aware-channel-join-design) ───
export const PRIOR_STRENGTH = 20;          // pseudo-sends of prior weight (conversion)
export const WEIGHT_MIN = 0.2;             // dead channels floor
export const WEIGHT_MAX = 1.3;             // converter ceiling (anti-clustering cap)
export const SQ_PRIOR_STRENGTH = 20;       // pseudo-sends of prior weight (send-quality)
export const SQ_MIN = 0.5;                 // delete-heavy floor (secondary nudge)
export const SQ_MAX = 1.1;                 // clean-survival ceiling
export const PRIOR_TTL_MS = 15 * 60 * 1000; // fleet-prior cache max age
export const PRIOR_RATE_FALLBACK = 0.03;   // used ONLY when fleet has zero sends
export const SQ_PRIOR_RATE_FALLBACK = 0.82;// used ONLY when fleet has zero sends

export interface FleetPrior {
  PRIOR_RATE: number;
  SQ_PRIOR_RATE: number;
}

const EMPTY_OUTCOME_ANALYTICS: ChannelIntelligenceOutcomeAnalytics = {
  messageStats: {
    totalSent: 0,
    totalFailed: 0,
    totalDeleted: 0,
    successRate: 0,
    channelsWithSends: 0,
    channelsWithFailures: 0,
    channelsWithDeleted: 0,
    avgSent: 0,
    avgFailed: 0,
  },
  restrictionStats: {
    freeformDeletionChannels: 0,
    followUpDeletionChannels: 0,
    totalFreeformDeletions: 0,
    totalFollowUpDeletions: 0,
  },
  successRateDistribution: [],
  topBySuccess: [],
  topByFailure: [],
  topByDeleted: [],
};

/**
 * Read-only lookup against the `channelIntelligence` collection, owned by the
 * sibling tg-platform service. CommonTgService never writes to this collection —
 * it only consults it to avoid re-joining channels the promotion system has
 * already flagged as blocked/unsafe, and (below) to surface the message-outcome
 * analytics the dashboard used to read off the now-dropped activeChannels
 * outcome fields.
 *
 * The exclusion predicate is intentionally duplicated here (rather than shared
 * via an import) because CommonTgService cannot depend on the tg-platform
 * package. Keep this in sync with the canonical predicate if it changes there.
 */
@Injectable()
export class ChannelIntelligenceReadService {
  private readonly logger = new Logger(ChannelIntelligenceReadService.name);
  private _priorCache: { value: FleetPrior; at: number } | null = null;

  constructor(@InjectModel('channelIntelligence') private readonly model: Model<any>) {}

  /**
   * Live fleet prior: PRIOR_RATE = Σcredited/Σattempted, SQ_PRIOR_RATE = Σsurvived/Σattempted,
   * over the whole channelIntelligence collection. Cached in-memory for `ttlMs` (two floats only).
   * Fails open to the last cached value, then to the measured literals. Never throws.
   */
  async getFleetPrior(ttlMs: number = PRIOR_TTL_MS): Promise<FleetPrior> {
    const now = Date.now();
    if (ttlMs > 0 && this._priorCache && now - this._priorCache.at < ttlMs) {
      return this._priorCache.value;
    }
    try {
      const [row] = await this.model
        .aggregate([
          {
            $group: {
              _id: null,
              // Coerce with $convert (not just $ifNull) so a wrong-typed field on one sibling-written
              // doc contributes 0 to BOTH numerator and denominator consistently — avoids a one-sided
              // skew of the live prior. ($sum ignores non-numerics silently, but $convert makes the
              // per-field drop symmetric across credited/attempted/survived.)
              totalCredited: { $sum: this.numFromCi('$DMs.credited') },
              totalAttempted: { $sum: this.numFromCi('$outcomes.attempted') },
              totalSurvived: { $sum: this.numFromCi('$outcomes.survived') },
            },
          },
        ])
        .exec();

      const totalAttempted = row?.totalAttempted ?? 0;
      const value: FleetPrior = {
        PRIOR_RATE: totalAttempted > 0 ? (row.totalCredited ?? 0) / totalAttempted : PRIOR_RATE_FALLBACK,
        SQ_PRIOR_RATE: totalAttempted > 0 ? (row.totalSurvived ?? 0) / totalAttempted : SQ_PRIOR_RATE_FALLBACK,
      };
      this._priorCache = { value, at: now };
      // Log the freshly-computed prior (recompute happens at most once per TTL) so an operator can
      // confirm during canary that the live fleet prior is ~0.03/0.82, per the spec's live-validation
      // step. On the cache-hit path (returned above) nothing is logged, keeping the hot path quiet.
      this.logger.log(
        `Live fleet prior computed: PRIOR_RATE=${value.PRIOR_RATE.toFixed(5)} SQ_PRIOR_RATE=${value.SQ_PRIOR_RATE.toFixed(5)} (Σattempted=${totalAttempted})`,
      );
      return value;
    } catch (error) {
      this.logger.warn(
        `getFleetPrior failed, using ${this._priorCache ? 'cached' : 'fallback'} prior: ${error instanceof Error ? error.message : error}`,
      );
      return this._priorCache?.value ?? { PRIOR_RATE: PRIOR_RATE_FALLBACK, SQ_PRIOR_RATE: SQ_PRIOR_RATE_FALLBACK };
    }
  }

  async getExcludedChannelIds(candidateIds: string[]): Promise<Set<string>> {
    const excluded = new Set<string>();
    if (!candidateIds?.length) return excluded;

    const docs = await this.model
      .find(
        { channelId: { $in: candidateIds } },
        {
          channelId: 1,
          'safety.status': 1,
          'safety.consecutiveErrors': 1,
          'outcomes.attempted': 1,
          'outcomes.deleted': 1,
        },
      )
      .lean()
      .exec();

    for (const doc of docs as any[]) {
      if (this.shouldExclude(doc)) {
        excluded.add(String(doc.channelId));
      }
    }

    return excluded;
  }

  private shouldExclude(doc: any): boolean {
    if (!doc) return false;

    if (doc.safety?.status === 'blocked') return true;

    const consecutiveErrors = doc.safety?.consecutiveErrors;
    if (typeof consecutiveErrors === 'number' && consecutiveErrors >= 3) return true;

    const attempted = doc.outcomes?.attempted ?? 0;
    const deleted = doc.outcomes?.deleted ?? 0;
    if (attempted >= 10 && deleted / attempted > 0.5) return true;

    return false;
  }

  /**
   * Reproduces the dashboard's former "Message Performance" / "Restriction Analysis" /
   * "Success Rate Distribution" / "Top Channels by ..." facets, previously computed from
   * activeChannels.{successMsgCount,failureMsgCount,deletedCount,freeformDeletedCount,
   * followUpDeletedCount} (dropped — see CMS commit 206967c1). The canonical source for
   * survived/deleted/freeformDeleted/followUpDeleted is now `outcomes.*` on this collection.
   *
   * `channelSideFailed` (send-side failure) has NO durable per-channel counter on
   * channelIntelligence — the closest available signal is `sum(messagePool[].channelSideFailed)`,
   * which is a bounded, per-message-variant counter (messagePool is capped) rather than an
   * all-time total. This is an APPROXIMATION and is documented as such wherever it's surfaced.
   *
   * `followupSent` / `followupFailed` (previously followupMsgSuccessCount/FailureCount) have NO
   * channelIntelligence equivalent at all (only a deletion breakdown exists for follow-ups, not a
   * success/failure count) and are intentionally NOT included in the returned shape.
   *
   * Read-only: never writes to channelIntelligence. Fails open (returns zeroed stats) if the
   * aggregation errors, so a hiccup on the sibling service's collection can't break the
   * dashboard's `analytics()` endpoint.
   */
  async getOutcomeAnalytics(): Promise<ChannelIntelligenceOutcomeAnalytics> {
    try {
      const pipeline: PipelineStage[] = [
        {
          $addFields: {
            _channelSideFailed: {
              $reduce: {
                input: { $ifNull: ['$messagePool', []] },
                initialValue: 0,
                in: { $add: ['$$value', { $ifNull: ['$$this.channelSideFailed', 0] }] },
              },
            },
          },
        },
        {
          $facet: {
            messageStats: [
              {
                $group: {
                  _id: null,
                  totalSent: { $sum: { $ifNull: ['$outcomes.survived', 0] } },
                  totalFailed: { $sum: '$_channelSideFailed' },
                  totalDeleted: { $sum: { $ifNull: ['$outcomes.deleted', 0] } },
                  channelsWithSends: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$outcomes.survived', 0] }, 0] }, 1, 0] } },
                  channelsWithFailures: { $sum: { $cond: [{ $gt: ['$_channelSideFailed', 0] }, 1, 0] } },
                  channelsWithDeleted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$outcomes.deleted', 0] }, 0] }, 1, 0] } },
                  avgSent: { $avg: { $ifNull: ['$outcomes.survived', 0] } },
                  avgFailed: { $avg: '$_channelSideFailed' },
                },
              },
            ],
            restrictionStats: [
              {
                $group: {
                  _id: null,
                  freeformDeletionChannels: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$outcomes.freeformDeleted', 0] }, 0] }, 1, 0] } },
                  followUpDeletionChannels: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$outcomes.followUpDeleted', 0] }, 0] }, 1, 0] } },
                  totalFreeformDeletions: { $sum: { $ifNull: ['$outcomes.freeformDeleted', 0] } },
                  totalFollowUpDeletions: { $sum: { $ifNull: ['$outcomes.followUpDeleted', 0] } },
                },
              },
            ],
            successRateDist: [
              {
                $match: {
                  $expr: { $gt: [{ $ifNull: ['$outcomes.attempted', 0] }, 0] },
                },
              },
              {
                $addFields: {
                  _rate: {
                    $multiply: [
                      { $divide: [{ $ifNull: ['$outcomes.survived', 0] }, '$outcomes.attempted'] },
                      100,
                    ],
                  },
                },
              },
              {
                $bucket: {
                  groupBy: '$_rate',
                  boundaries: [0, 20, 40, 60, 80, 101],
                  default: 'other',
                  output: { count: { $sum: 1 } },
                },
              },
            ],
            topBySuccess: [
              { $match: { 'outcomes.survived': { $gt: 0 } } },
              { $sort: { 'outcomes.survived': -1 } },
              { $limit: 10 },
              {
                $project: {
                  _id: 0,
                  channelId: 1,
                  survived: '$outcomes.survived',
                  deleted: '$outcomes.deleted',
                  channelSideFailed: '$_channelSideFailed',
                },
              },
            ],
            topByFailure: [
              { $match: { _channelSideFailed: { $gt: 0 } } },
              { $sort: { _channelSideFailed: -1 } },
              { $limit: 10 },
              {
                $project: {
                  _id: 0,
                  channelId: 1,
                  survived: '$outcomes.survived',
                  channelSideFailed: '$_channelSideFailed',
                },
              },
            ],
            topByDeleted: [
              { $match: { 'outcomes.deleted': { $gt: 0 } } },
              { $sort: { 'outcomes.deleted': -1 } },
              { $limit: 10 },
              {
                $project: {
                  _id: 0,
                  channelId: 1,
                  deleted: '$outcomes.deleted',
                  survived: '$outcomes.survived',
                },
              },
            ],
          },
        },
      ];

      const [result] = await this.model.aggregate(pipeline).allowDiskUse(true).exec();

      const msgStats = result?.messageStats?.[0] || {};
      const restrictStats = result?.restrictionStats?.[0] || {};
      const totalAttempts = (msgStats.totalSent || 0) + (msgStats.totalFailed || 0);

      return {
        messageStats: {
          totalSent: msgStats.totalSent || 0,
          totalFailed: msgStats.totalFailed || 0,
          totalDeleted: msgStats.totalDeleted || 0,
          // Denominator (totalAttempts) includes _channelSideFailed, which is an APPROXIMATION
          // (see class doc above) — so this successRate is itself approximate, not exact.
          // The dashboard must label it "(approx.)" wherever it surfaces this value.
          successRate: totalAttempts > 0 ? Math.round(((msgStats.totalSent || 0) / totalAttempts) * 100) : 0,
          channelsWithSends: msgStats.channelsWithSends || 0,
          channelsWithFailures: msgStats.channelsWithFailures || 0,
          channelsWithDeleted: msgStats.channelsWithDeleted || 0,
          avgSent: Math.round(msgStats.avgSent || 0),
          avgFailed: Math.round(msgStats.avgFailed || 0),
        },
        restrictionStats: {
          freeformDeletionChannels: restrictStats.freeformDeletionChannels || 0,
          followUpDeletionChannels: restrictStats.followUpDeletionChannels || 0,
          totalFreeformDeletions: restrictStats.totalFreeformDeletions || 0,
          totalFollowUpDeletions: restrictStats.totalFollowUpDeletions || 0,
        },
        successRateDistribution: (result?.successRateDist || []).map((b: any) => ({
          range: b._id === 'other' ? 'other' : `${b._id}-${b._id + 20}%`,
          count: b.count,
        })),
        topBySuccess: result?.topBySuccess || [],
        topByFailure: result?.topByFailure || [],
        topByDeleted: result?.topByDeleted || [],
      };
    } catch (error) {
      this.logger.warn(
        `getOutcomeAnalytics failed, returning empty stats (fail-open): ${error instanceof Error ? error.message : error}`,
      );
      return EMPTY_OUTCOME_ANALYTICS;
    }
  }

  /**
   * Returns the two pipeline stages that implement conversion-aware, stateless join sorting:
   *   sortScore = rand() × conversionWeight × sendQualityWeight
   * both weights shrunk toward the LIVE fleet prior (passed in). Pure function of (prior + constants);
   * no I/O. Spliced into each getActiveChannels pipeline in place of the old reaction/diversity sort.
   */
  /**
   * Aggregation expression that coerces a channelIntelligence field reference to a finite number,
   * defaulting to 0 for null/missing AND for wrong-typed values (string/bool/array/etc). Guards
   * against out-of-contract sibling-written docs: `$ifNull` alone lets a non-null wrong type through
   * and `$add`/`$divide` then throw. `$convert ... onError/onNull: 0` never throws and yields a
   * finite number, so a malformed doc degrades to the neutral prior instead of breaking the query.
   */
  private numFromCi(fieldRef: string): Record<string, unknown> {
    return { $convert: { input: fieldRef, to: 'double', onError: 0, onNull: 0 } };
  }

  private buildChannelIntelligenceExclusionFlag(): Record<string, unknown> {
    return {
      $let: {
        vars: {
          ci: { $ifNull: [{ $arrayElemAt: ['$_ci', 0] }, {}] },
        },
        in: {
          $let: {
            vars: {
              attempted: this.numFromCi('$$ci.outcomes.attempted'),
              deleted: this.numFromCi('$$ci.outcomes.deleted'),
              consecutiveErrors: this.numFromCi('$$ci.safety.consecutiveErrors'),
            },
            in: {
              $or: [
                { $eq: ['$$ci.safety.status', 'blocked'] },
                { $gte: ['$$consecutiveErrors', 3] },
                {
                  $and: [
                    { $gte: ['$$attempted', 10] },
                    {
                      $gt: [
                        {
                          $cond: [
                            { $gt: ['$$attempted', 0] },
                            { $divide: ['$$deleted', '$$attempted'] },
                            0,
                          ],
                        },
                        0.5,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };
  }

  buildConversionAwareSortStages(prior: FleetPrior): PipelineStage[] {
    const priorRate = prior?.PRIOR_RATE > 0 ? prior.PRIOR_RATE : PRIOR_RATE_FALLBACK;
    const sqPriorRate = prior?.SQ_PRIOR_RATE > 0 ? prior.SQ_PRIOR_RATE : SQ_PRIOR_RATE_FALLBACK;

    return [
      {
        $lookup: {
          from: 'channelIntelligence',
          localField: 'channelId',
          foreignField: 'channelId',
          as: '_ci',
        },
      },
      {
        $addFields: {
          _ciExcluded: this.buildChannelIntelligenceExclusionFlag(),
        },
      },
      { $match: { _ciExcluded: { $ne: true } } },
      {
        $addFields: {
          sortScore: {
            $let: {
              vars: {
                ci: { $ifNull: [{ $arrayElemAt: ['$_ci', 0] }, {}] },
              },
              in: {
                $let: {
                  // Coerce every joined field to a number. channelIntelligence is written by a
                  // SIBLING service into a strict:false collection, so a field can arrive as a
                  // string ("50"), bool, array, or missing. $ifNull only guards null/missing —
                  // a wrong-typed value would make $add/$divide THROW and (via the fail-open
                  // catch) silently disable the conversion tilt fleet-wide. numFromCi() uses
                  // $convert with onError/onNull->0 so a single malformed doc only neutralizes
                  // its OWN weight (falls to the neutral prior) instead of poisoning the feature.
                  vars: {
                    attempted: this.numFromCi('$$ci.outcomes.attempted'),
                    credited: this.numFromCi('$$ci.DMs.credited'),
                    survived: this.numFromCi('$$ci.outcomes.survived'),
                  },
                  in: {
                    $let: {
                      vars: {
                        // conversion shrink toward live PRIOR_RATE, normalized so neutral == 1.0
                        conversionWeight: {
                          $min: [WEIGHT_MAX, { $max: [WEIGHT_MIN, {
                            $divide: [
                              { $divide: [
                                { $add: [{ $multiply: [priorRate, PRIOR_STRENGTH] }, '$$credited'] },
                                { $add: [PRIOR_STRENGTH, '$$attempted'] },
                              ] },
                              priorRate,
                            ],
                          }] }],
                        },
                        // send-quality shrink toward live SQ_PRIOR_RATE, normalized so neutral == 1.0
                        sendQualityWeight: {
                          $min: [SQ_MAX, { $max: [SQ_MIN, {
                            $divide: [
                              { $divide: [
                                { $add: [{ $multiply: [sqPriorRate, SQ_PRIOR_STRENGTH] }, '$$survived'] },
                                { $add: [SQ_PRIOR_STRENGTH, '$$attempted'] },
                              ] },
                              sqPriorRate,
                            ],
                          }] }],
                        },
                      },
                      in: { $multiply: [{ $rand: {} }, '$$conversionWeight', '$$sendQualityWeight'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { $project: { _ci: 0, _ciExcluded: 0 } },
    ];
  }

  /**
   * Fail-open fallback sort: pure random, NO $lookup (so it shares none of the
   * conversion sort's cross-collection failure surface). Used by getActiveChannels
   * when the conversion-aware aggregation errors at runtime, so the tilt can never
   * starve the join pipeline (spec 2026-08-01, Error handling). Returns channels in
   * random order — the same spread the conversion sort degrades to, minus the tilt.
   */
  buildRandomOnlySortStages(): PipelineStage[] {
    return [
      { $addFields: { sortScore: { $rand: {} } } },
    ];
  }
}

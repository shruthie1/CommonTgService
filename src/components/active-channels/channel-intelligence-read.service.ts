import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Read-only lookup against the `channelIntelligence` collection, owned by the
 * sibling tg-platform service. CommonTgService never writes to this collection —
 * it only consults it to avoid re-joining channels the promotion system has
 * already flagged as blocked/unsafe.
 *
 * The exclusion predicate is intentionally duplicated here (rather than shared
 * via an import) because CommonTgService cannot depend on the tg-platform
 * package. Keep this in sync with the canonical predicate if it changes there.
 */
@Injectable()
export class ChannelIntelligenceReadService {
  constructor(@InjectModel('channelIntelligence') private readonly model: Model<any>) {}

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
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PromoteStatDocument = PromoteStat & Document;

/**
 * tg-aut promotion-health retry base (tg-platform job-manager.ts, owner rule 2026-11-20): the engine's cumulative
 * send counters when promotions were retried, tagged with the tg-aut process. Written only by tg.
 */
export interface PromoHealthRetryBase {
  proc: string;
  success: number;
  failed: number;
}

/**
 * tg-aut promotion-health pause cycle of the client's main (tg-platform job-manager.ts + tg-db promote.repository.ts
 * setPromoHealthPause, conditional raw-driver writes). Pause 30 min, retry, swap after 3 failed retries. null = no cycle.
 */
export interface PromoHealthPause {
  mobile: string;
  pausedAt: number;
  until: number;
  failedRetries: number;
  retriedAt: number | null;
  retryBase: PromoHealthRetryBase | null;
}

/** Paths CMS never writes: tg owns them. Stripped from every CMS model update (see the pre hooks below). */
export const TG_OWNED_PROMOTE_STAT_PATHS = ['promoHealthPause'] as const;

@Schema()
export class PromoteStat {
  @ApiProperty({ description: 'Client ID' })
  @Prop({ required: true, unique: true })
  client: string;

  @ApiProperty({ description: 'Data' })
  @Prop({ required: true, type: Map, of: Number })
  data: Map<string, number>;

  @ApiProperty({ description: 'Total Count' })
  @Prop({ required: true })
  totalCount: number;

  @ApiProperty({ description: 'Unique Channels' })
  @Prop({ required: true })
  uniqueChannels: number;

  @ApiProperty({ description: 'Release Day' })
  @Prop({ required: true })
  releaseDay: number;

  @ApiProperty({ description: 'Is Active' })
  @Prop({ required: true })
  isActive: boolean;

  @ApiProperty({ description: 'Last Updated TimeStamp' })
  @Prop({ required: true })
  lastUpdatedTimeStamp: number;

  @ApiProperty({ description: 'Channels' })
  @Prop({ required: true, type: [String] })
  channels: string[];

  // F10 (data-model review 2026-11-08): written only by tg-platform through the raw driver (tg-db promote.repository.ts:
  // $inc count, boot-stamp mobile); CMS code never writes them. Declared additively (optional, no default, no
  // validator). count is Mixed, not Number: legacy rows hold strings/NaN (tg-db promote-stats.normalize.ts) and a
  // Number path would cast them on read or cast-fail; Mixed never casts. Canonical type: number.
  /** Per-session promotion count (canonical: number; legacy rows may hold strings/NaN). */
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  count?: number;

  /** Account the last tg boot stamp was for (absent on older docs). */
  @Prop({ type: String, required: false })
  mobile?: string;

  // tg-aut promotion-health cycle (2026-11-20): written only by tg-platform through the raw driver, every write
  // conditional on the cycle it read. Declared additively and read-only for CMS: optional, no default, no validator,
  // Mixed so a hydrate never casts it (retryBase is a nested object: {proc, success, failed} or null). CMS model
  // updates cannot write it (stripTgOwnedPaths); the daily promoteStats reset ($set of named fields, raw driver)
  // and reinitPromoteStats ($set of named fields) never name it.
  /** Pause cycle of the main: {mobile, pausedAt, until, failedRetries, retriedAt, retryBase}; null or absent = none. */
  @ApiProperty({ description: 'tg-aut promotion-health pause cycle (read-only, written by tg-aut)', required: false, nullable: true, readOnly: true })
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  promoHealthPause?: PromoHealthPause | null;
}

export const PromoteStatSchema = SchemaFactory.createForClass(PromoteStat);

/** True for a tg-owned path or a dotted path under one (promoHealthPause.retryBase). */
function isTgOwnedPath(key: string): boolean {
  return TG_OWNED_PROMOTE_STAT_PATHS.some((path) => key === path || key.startsWith(`${path}.`));
}

/**
 * Removes tg-owned paths from an update document, in place: top-level keys (Mongoose wraps them in $set) and the
 * keys of every operator ($set, $unset, $setOnInsert, $inc, ...). Exported for tests.
 */
export function stripTgOwnedPaths(update: Record<string, unknown> | null | undefined): void {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return;
  for (const key of Object.keys(update)) {
    if (key.startsWith('$')) {
      const operand = update[key];
      if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
        for (const path of Object.keys(operand)) if (isTgOwnedPath(path)) delete (operand as Record<string, unknown>)[path];
      }
    } else if (isTgOwnedPath(key)) {
      delete update[key];
    }
  }
}

// Read-only for CMS: every model update path (PUT /promote-stats/:client sends its body to findOneAndUpdate) drops
// tg-owned paths, so a CMS body or a future writer cannot clobber the cycle tg conditions its writes on.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
  PromoteStatSchema.pre(op, function stripTgOwned() {
    stripTgOwnedPaths(this.getUpdate() as Record<string, unknown> | null);
  });
}

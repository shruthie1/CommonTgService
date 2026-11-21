import { Logger } from '@nestjs/common';
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
  /** Set when tg re-took the base after the retry (a restart): evidence counts from here. */
  at?: number;
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
  /** Absent on cycles written before retry bases existed (tg-db PromoHealthPause). */
  retryBase?: PromoHealthRetryBase | null;
  /**
   * A cycle with no pause (promotions stay active): `gate` = the ban gate is the only cause; `swap_wait` = a swap
   * request ended without a swap and `until` is when it may be asked again. Absent on pause cycles (tg-db PromoHealthPause).
   */
  hold?: 'gate' | 'swap_wait';
}

/**
 * Paths no CMS model write may set: tg owns promoHealthPause; resetRunId belongs to the raw-driver daily reset
 * (batch 5 review r1: a PUT/POST that set or cleared it would make a row skip its reset or reset twice). Stripped
 * from every CMS model write (see the pre hooks below).
 */
export const TG_OWNED_PROMOTE_STAT_PATHS = ['promoHealthPause', 'resetRunId'] as const;

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

  /**
   * Batch 5 (owner 2026-11-21): the daily reset run that last reset this row (controlPlaneJobRuns _id,
   * `daily-promote-stats-reset:<IST day>`), written by the raw-driver reset in scheduled-jobs.service.ts so a
   * re-claimed run never resets a row twice. Absent on rows not reset since. Nothing else reads it. CMS model
   * updates and inserts cannot set or clear it (TG_OWNED_PROMOTE_STAT_PATHS); a full replace drops it by omission
   * (no CMS caller replaces promoteStats rows).
   */
  @Prop({ type: String, required: false })
  resetRunId?: string;

  // tg-aut promotion-health cycle (2026-11-20): written only by tg-platform through the raw driver, every write
  // conditional on the cycle it read. Declared additively and read-only for CMS: optional, no default, no validator,
  // Mixed so a hydrate never casts it (retryBase is a nested object: {proc, success, failed} or null). CMS model
  // updates cannot write it (stripTgOwnedPaths); the daily promoteStats reset ($set of named fields, raw driver)
  // never names it.
  /** Pause cycle of the main: {mobile, pausedAt, until, failedRetries, retriedAt, retryBase, hold}; null or absent = none. */
  @ApiProperty({ description: 'tg-aut promotion-health pause cycle (read-only, written by tg-aut)', required: false, nullable: true, readOnly: true })
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  promoHealthPause?: PromoHealthPause | null;
}

export const PromoteStatSchema = SchemaFactory.createForClass(PromoteStat);

/** True for a tg-owned path or a dotted path under one (promoHealthPause.retryBase). */
function isTgOwnedPath(key: string): boolean {
  return TG_OWNED_PROMOTE_STAT_PATHS.some((path) => key === path || key.startsWith(`${path}.`));
}

const schemaLogger = new Logger('PromoteStatSchema');

/** Thrown for an update pipeline on promoteStats: a pipeline can write any path, tg-owned ones included. */
export class PromoteStatPipelineUpdateError extends Error {
  constructor() {
    super('promoteStats: update pipelines are refused (a pipeline can write tg-owned paths); use operator updates');
    this.name = 'PromoteStatPipelineUpdateError';
  }
}

/**
 * Removes tg-owned paths from an update document, in place: top-level keys (Mongoose wraps them in $set), the
 * keys of every operator ($set, $unset, $setOnInsert, $inc, ...) and, for $rename, a tg-owned source OR target
 * (a rename onto promoHealthPause would overwrite the cycle). An update pipeline (array) is refused with
 * PromoteStatPipelineUpdateError and logs `promote-stats kind=pipeline_refused`; a stripped path logs
 * `promote-stats kind=tg_path_stripped`. Exported for tests.
 */
export function stripTgOwnedPaths(update: Record<string, unknown> | unknown[] | null | undefined): void {
  if (Array.isArray(update)) {
    schemaLogger.warn('promote-stats kind=pipeline_refused reason=tg_owned_paths');
    throw new PromoteStatPipelineUpdateError();
  }
  if (!update || typeof update !== 'object') return;
  const stripped: string[] = [];
  for (const key of Object.keys(update)) {
    if (key.startsWith('$')) {
      const operand = update[key];
      if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
        for (const [path, value] of Object.entries(operand)) {
          const renameTarget = key === '$rename' && typeof value === 'string' && isTgOwnedPath(value);
          if (isTgOwnedPath(path) || renameTarget) {
            delete (operand as Record<string, unknown>)[path];
            stripped.push(renameTarget ? `${key}:${path}->${value}` : `${key}:${path}`);
          }
        }
      }
    } else if (isTgOwnedPath(key)) {
      delete update[key];
      stripped.push(key);
    }
  }
  if (stripped.length) schemaLogger.warn(`promote-stats kind=tg_path_stripped paths=${stripped.join(',')}`);
}

/** Removes tg-owned paths from a plain document or a hydrated one (insert and save paths). Exported for tests. */
export function stripTgOwnedFromDoc(doc: unknown): void {
  if (!doc || typeof doc !== 'object') return;
  for (const path of TG_OWNED_PROMOTE_STAT_PATHS) {
    const hydrated = doc as { set?: (path: string, value: unknown) => void; $__?: unknown };
    if (hydrated.$__ && typeof hydrated.set === 'function') hydrated.set(path, undefined);
    else delete (doc as Record<string, unknown>)[path];
  }
}

/**
 * Strips tg-owned paths from every write of a Model.bulkWrite op list, in place: updateOne/updateMany updates,
 * replaceOne replacements and insertOne documents. Exported for tests.
 */
export function stripTgOwnedFromBulkOps(ops: unknown): void {
  if (!Array.isArray(ops)) return;
  for (const op of ops as Array<Record<string, any>>) {
    if (!op || typeof op !== 'object') continue;
    if (op.updateOne?.update) stripTgOwnedPaths(op.updateOne.update);
    if (op.updateMany?.update) stripTgOwnedPaths(op.updateMany.update);
    if (op.replaceOne?.replacement) stripTgOwnedPaths(op.replaceOne.replacement);
    if (op.insertOne?.document) stripTgOwnedFromDoc(op.insertOne.document);
  }
}

// Read-only for CMS: every model write path (PUT /promote-stats/:client sends its body to findOneAndUpdate) drops
// tg-owned paths, so a CMS body or a future writer cannot clobber the cycle tg conditions its writes on.
// A replace (replaceOne, findOneAndReplace, a bulk replaceOne) cannot set the cycle, but by its nature it still
// removes a stored one; tg then reads no cycle (a paused main retries at once at count 0), the same as a daily reset.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'] as const) {
  PromoteStatSchema.pre(op, function stripTgOwned() {
    stripTgOwnedPaths(this.getUpdate() as Record<string, unknown> | unknown[] | null);
  });
}

PromoteStatSchema.pre('bulkWrite', function stripTgOwnedBulk(ops: unknown) {
  stripTgOwnedFromBulkOps(ops);
});

PromoteStatSchema.pre('insertMany', function stripTgOwnedInsertMany(docs: unknown) {
  for (const doc of Array.isArray(docs) ? docs : [docs]) stripTgOwnedFromDoc(doc);
});

// save() and Model.create(): a new doc never carries the cycle; an existing doc never sends a changed one.
PromoteStatSchema.pre('save', function stripTgOwnedSave() {
  if (this.isNew) {
    for (const path of TG_OWNED_PROMOTE_STAT_PATHS) this.set(path, undefined);
    return;
  }
  for (const path of this.modifiedPaths()) if (isTgOwnedPath(path)) this.unmarkModified(path);
});

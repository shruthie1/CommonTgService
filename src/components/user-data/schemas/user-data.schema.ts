import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Document } from 'mongoose';

export type UserDataDocument = UserData & Document;

@Schema({
    collection: 'userData', versionKey: false, autoIndex: true, timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        } } })
export class UserData {
    @Prop({ required: true })
    chatId: string;

    @Prop({ required: true, default: 0 })
    totalCount: number;

    @Prop({ required: true, default: 0 })
    picCount: number;

    @Prop({ required: true, default: 0 })
    lastMsgTimeStamp: number;

    @Prop({ required: true, default: 0 })
    limitTime: number;

    @Prop({ required: true, default: 0 })
    paidCount: number;

    @Prop({ required: true, default: 0 })
    prfCount: number;

    @Prop({ required: true, default: 1 })
    canReply: number;

    @Prop({ required: true, default: 0 })
    payAmount: number;

    // Empty strings are the canonical tg-aut defaults until Telegram identity data is known.
    @Prop({ required: false, default: '' })
    username: string;

    @Prop({ required: false, default: '' })
    accessHash: string;

    @Prop({ required: true, default: true })
    paidReply: boolean;

    @Prop({ required: true, default: false })
    demoGiven: boolean;

    @Prop({ required: true, default: false })
    secondShow: boolean;

    @Prop({ required: true, default: 0 })
    fullShow: number;

    /**
     * PERSONA-level identity (= clients.dbcoll). NOT unique per client: each persona is served by
     * two independent Telegram accounts (shruthi -> shruthi1 + shruthi2), which is why the unique
     * index below is (chatId, profile) and why two clients can share one row.
     */
    @Prop({ required: true })
    profile: string;

    /**
     * CLIENT-level identity (= clients.clientId, e.g. "shruthi2"). OPTIONAL and additive: stamped
     * on insert by tg-aut for rows created from 2026-08-15 onward. Absent on historical rows —
     * absence means "not known", never a value. Reads prefer a client-owned row and fall back to
     * the persona row, so both eras coexist without a destructive migration.
     *
     * No single-field index: `clientId_chatId` (declared below, also created by tg-db) has clientId
     * as its prefix and serves every clientId-only query. The old `index: true` kept recreating a
     * redundant `clientId_1` (4 ops vs 320,228 on clientId_chatId, 72 h to 2026-10-25).
     */
    @Prop({ required: false })
    clientId?: string;

    @Prop({ required: true, default: 0 })
    picsSent: number;

    @Prop({ required: true, default: 0 })
    highestPayAmount: number;

    @Prop({ required: true, default: 0 })
    cheatCount: number;

    @Prop({ required: true, default: 0 })
    callTime: number;

    @Prop({ type: [String], required: true, default: [] })
    videos: string[];

    /** Canonical common-channel IDs observed when this DM was attributed. */
    @Prop({ type: [String], required: true, default: [] })
    attributionChannelIds: string[];

    @Prop({ required: true, default: 0 })
    attributionUpdatedAt: number;

    @Prop({ required: false })
    lastActiveTime?: Date;


    // ---- tg-platform-owned fields (written by tg-aut/tg-db creditPayment; CMS only declares them) ----
    // Declared (not `strict: false`) so Mongoose keeps them while still dropping arbitrary fields.
    // All optional with NO defaults: they are absent on legacy rows and tg-platform treats absent as 0/[].
    // Types per tg-platform apps/tg-aut/src/core/dbservice.ts UserDataDto and
    // packages/tg-db/src/collections/user-data.repository.ts.

    /** Monotonic lifetime payment peak ($max only). */
    @Prop({ type: Number, required: false })
    lifetimePaid?: number;

    /** Count of accepted credits ($inc). */
    @Prop({ type: Number, required: false })
    lifetimeCredits?: number;

    /** Idempotency keys of accepted payments (bounded history). default undefined: an array Prop would otherwise default to []. */
    @Prop({ type: [String], required: false, default: undefined })
    creditKeys?: string[];

    /** Epoch ms of first accepted payment (Date.now()). */
    @Prop({ type: Number, required: false })
    firstPaidAt?: number;

    /** True inbound-message counter ($inc only by tg-aut). */
    @Prop({ type: Number, required: false })
    msgCount?: number;

    /** "Treat as established" flag, numeric, $set freely by tg-aut. */
    @Prop({ type: Number, required: false })
    windowCount?: number;

    /** Grace-period flag set by tg-aut (boolean in prod: 231 rows on 2026-10-04). */
    @Prop({ type: Boolean, required: false })
    graceFlag?: boolean;

    /** Epoch ms of the most recent accepted payment (tg-aut creditPayment). */
    @Prop({ type: Number, required: false })
    lastPaidAt?: number;

    /**
     * `videos.length` when the current service cycle started (tg-aut startServiceCycle). Service-limit
     * checks count `videos.length - cycleVideoBase`; vcui reads it from /userdata (callEligibility.ts).
     */
    @Prop({ type: Number, required: false })
    cycleVideoBase?: number;

    /** Paid level of the current service cycle (tg-aut startServiceCycle / service-completion). */
    @Prop({ type: Number, required: false })
    cyclePaid?: number;

    /**
     * Per-video resume state keyed by videoId: { positionSec, durationSec|null, updatedAt, completed }
     * (tg-aut in-house calls, written as `callProgress.<videoId>`). Mixed: keys are dynamic.
     * default undefined so legacy rows are not stamped with {}.
     */
    @Prop({ type: mongoose.Schema.Types.Mixed, required: false, default: undefined })
    callProgress?: Record<string, { positionSec: number; durationSec: number | null; updatedAt: number; completed: boolean }>;

}

export const UserDataSchema = SchemaFactory.createForClass(UserData);

// tg-aut creates exactly one conversation-state document per profile/chat pair.
// Declaring the existing production index here keeps CommonTgService's schema contract
// aligned without changing the live index definition.
UserDataSchema.index({ chatId: 1, profile: 1 }, { unique: true, name: 'chatId_Profile' });
// Same spec and name as tg-db UserDataRepository.ensureIndexes (live, non-unique); serves the
// clientId-owned row lookup and clientId-only queries.
UserDataSchema.index({ clientId: 1, chatId: 1 }, { name: 'clientId_chatId' });

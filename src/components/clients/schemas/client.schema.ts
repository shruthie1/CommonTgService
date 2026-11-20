import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';
import { canonicalizeMobile } from '../../shared/mobile-utils';
import type { ClientDeadMainState, ClientDegradedState, ClientSwapRetryState, SwapLease } from '../degraded-swap';

export type ClientDocument = Client & Document;

@Schema({
    collection: 'clients', versionKey: false, autoIndex: true, timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        } } })
export class Client {
    @ApiProperty({ description: 'Channel link' })
    @Prop({ required: true })
    channelLink: string;

    @ApiProperty({ description: 'Database collection name' })
    @Prop({ required: true })
    dbcoll: string;

    @ApiProperty({ description: 'Client link' })
    @Prop({ required: true })
    link: string;

    @ApiProperty({ description: 'Display name' })
    @Prop({ required: true })
    name: string;

    @ApiProperty({ description: 'Mobile number' })
    @Prop({ required: true, unique: true, set: canonicalizeMobile })
    mobile: string;

    @ApiProperty({ description: '2FA password' })
    @Prop({ required: true })
    password: string;

    @ApiProperty({ description: 'tg-aut repl link' })
    @Prop({ required: true })
    repl: string;

    @ApiProperty({ description: 'Promote repl link' })
    @Prop({ required: true })
    promoteRepl: string;

    @ApiProperty({ description: 'Telegram session string' })
    @Prop({ required: true })
    session: string;

    @ApiProperty({ description: 'Telegram username' })
    @Prop({ required: true })
    username: string;

    @ApiProperty({ description: 'Unique client identifier' })
    @Prop({ required: true, unique: true })
    clientId: string;

    @ApiProperty({ description: 'Deploy restart URL' })
    @Prop({ required: true })
    deployKey: string;

    @ApiProperty({ description: 'Product identifier' })
    @Prop({ required: true })
    product: string;

    @ApiProperty({ description: 'Paytm QR ID', required: false })
    @Prop({ required: false, default: null })
    qrId: string;

    @ApiProperty({ description: 'Google Pay ID', required: false })
    @Prop({ required: false, default: null })
    gpayId: string;

    @ApiProperty({ description: 'First name pool for persona assignment', required: false })
    @Prop({ required: false, type: [String], default: [] })
    firstNames: string[];

    @ApiProperty({ description: 'Last name pool for buffer clients', required: false })
    @Prop({ required: false, type: [String], default: [] })
    bufferLastNames: string[];

    @ApiProperty({ description: 'Last name pool for promote clients', required: false })
    @Prop({ required: false, type: [String], default: [] })
    promoteLastNames: string[];

    @ApiProperty({ description: 'Bio pool for persona assignment', required: false })
    @Prop({ required: false, type: [String], default: [] })
    bios: string[];

    @ApiProperty({ description: 'Profile pic URL pool', required: false })
    @Prop({ required: false, type: [String], default: [] })
    profilePics: string[];

    @ApiProperty({
        description: 'Set while the client runs on a degraded-swap account (tier 2-4); cleared by the next tier-1 swap. Not returned by masked endpoints.',
        required: false,
        type: Object,
    })
    @Prop({ required: false, type: Object, default: undefined })
    degraded?: ClientDegradedState | null;

    @ApiProperty({
        description: 'Rescue / pool-refill episode of the swap-maintenance job (attempts, next try, hard stop). Not returned by masked endpoints.',
        required: false,
        type: Object,
    })
    @Prop({ required: false, type: Object, default: undefined })
    swapRetry?: ClientSwapRetryState | null;

    @ApiProperty({
        description: 'Set when tg-aut (the live session) reported the current main dead via /setupClient; the only evidence the rescue pass acts on. Cleared by the next swap or mobile change. Not returned by masked endpoints.',
        required: false,
        type: Object,
    })
    @Prop({ required: false, type: Object, default: undefined })
    deadMain?: ClientDeadMainState | null;

    @ApiProperty({
        description: 'Cross-process setupClient lease (owner host:pid:uuid, until). Not returned by masked endpoints.',
        required: false,
        type: Object,
    })
    @Prop({ required: false, type: Object, default: undefined })
    swapLease?: SwapLease | null;

    @ApiProperty({
        description: 'Time of the last setupClient cutover. Reports without reportedMobile are ignored for SWAP_REPORT_GRACE_MS after it (they may come from the replaced process). Not returned by masked endpoints.',
        required: false,
        type: Date,
    })
    @Prop({ required: false, type: Date, default: undefined })
    swappedAt?: Date | null;

    @ApiProperty({
        description: 'Time of the last session-only change by update(). Reports for the same mobile are ignored for SWAP_REPORT_GRACE_MS after it (the running process may still hold the old session). Cleared by a cutover. Not returned by masked endpoints.',
        required: false,
        type: Date,
    })
    @Prop({ required: false, type: Date, default: undefined })
    sessionChangedAt?: Date | null;

}

export const ClientSchema = SchemaFactory.createForClass(Client);

/**
 * Stored on old clients rows, no longer in the schema and read by nothing (mainAccount: dropped from
 * the schema 2026-11-08). The data stays (no $unset); every model read projects it out so API
 * responses and the clients cache stop returning it. Inclusive projections already leave it out.
 */
export const RETIRED_CLIENT_FIELDS = ['mainAccount'] as const;

/**
 * True when Mongo would treat the projection as inclusion: any field set to 1/true (an `_id`-only
 * `{_id: 1}` included) or an `$elemMatch` / `$meta` operator. `$slice` alone and 0/false values
 * are exclusion-style, so the retired fields are added to those.
 */
export function isInclusiveProjection(projection: unknown): boolean {
    if (!projection || typeof projection !== 'object') return false;
    const entries = Object.entries(projection as Record<string, unknown>);
    const included = (v: unknown) => v === 1 || v === true
        || (typeof v === 'object' && v !== null && ('$elemMatch' in v || '$meta' in v));
    if (entries.some(([k, v]) => k !== '_id' && included(v))) return true;
    return entries.length > 0 && entries.every(([k, v]) => k === '_id' && included(v));
}

ClientSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete'], function () {
    const projection = this.projection();
    if (isInclusiveProjection(projection)) return;
    this.projection({ ...(projection || {}), ...Object.fromEntries(RETIRED_CLIENT_FIELDS.map((f) => [f, 0])) });
});

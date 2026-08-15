import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
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
     */
    @Prop({ required: false, index: true })
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

}

export const UserDataSchema = SchemaFactory.createForClass(UserData);

// tg-aut creates exactly one conversation-state document per profile/chat pair.
// Declaring the existing production index here keeps CommonTgService's schema contract
// aligned without changing the live index definition.
UserDataSchema.index({ chatId: 1, profile: 1 }, { unique: true, name: 'chatId_Profile' });

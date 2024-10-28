import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDataDocument = UserData & Document;

@Schema({
    collection: 'userData', versionKey: false, autoIndex: true, timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret._id;
        },
    },
})
export class UserData {
    @Prop({ required: true })
    chatId: string;

    @Prop({ required: true })
    totalCount: number;

    @Prop({ required: true })
    picCount: number;

    @Prop({ required: true })
    lastMsgTimeStamp: number;

    @Prop({ required: true })
    limitTime: number;

    @Prop({ required: true })
    paidCount: number;

    @Prop({ required: true })
    prfCount: number;

    @Prop({ required: true })
    canReply: number;

    @Prop({ required: true })
    payAmount: number;

    @Prop({ required: true })
    username: string;

    @Prop({ required: true })
    accessHash: string;

    @Prop({ required: true })
    paidReply: boolean;

    @Prop({ required: true })
    demoGiven: boolean;

    @Prop({ required: true })
    secondShow: boolean;

    @Prop({ required: true, default: 0 })
    fullShow: number;

    @Prop({ required: true })
    profile: string;

    @Prop({ required: true })
    picSent: boolean;

    @Prop({ required: true })
    highestPayAmount: number;

    @Prop({ required: true })
    cheatCount: number;

    @Prop({ required: true })
    callTime: number;

    @Prop({ required: false, default:[] })
    videos: number[];
}

export const UserDataSchema = SchemaFactory.createForClass(UserData);

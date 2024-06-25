import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ActiveChannelDocument = ActiveChannel & Document;
@Schema({ collection: 'activeChannels', versionKey: false, autoIndex: true })  // Specify the collection name here
export class ActiveChannel extends Document {
  @Prop({ required: true, unique: true })
  channelId: string;

  @Prop({ default: false })
  broadcast: boolean;

  @Prop({ default: true })
  canSendMsgs: boolean;

  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  participantsCount: number;

  @Prop({ default: false })
  restricted: boolean;

  @Prop({ default: false })
  sendMessages: boolean;

  @Prop({ required: true })
  title: string;

  @Prop({ required: false, default: null })
  username: string;

  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  wordRestriction: number = 0;

  @Prop({ type: mongoose.Schema.Types.Number, default: 0 })
  dMRestriction: number = 0;

  @Prop({ type: [String], default: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"] })
  availableMsgs: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

  @Prop({
    type: [String], default: [
      '❤', '🔥', '👏', '🥰', '😁', '🤔',
      '🤯', '😱', '🤬', '😢', '🎉', '🤩',
      '🤮', '💩', '🙏', '👌', '🕊', '🤡',
      '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
      '🤣', '💔', '🏆', '😭', '😴', '👍',
      '🌚', '⚡', '🍌', '😐', '💋', '👻',
      '👀', '🙈', '🤝', '🤗', '🆒',
      '🗿', '🙉', '🙊', '🤷', '👎'
    ]
  })
  reactions: string[] = [
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
  ];

  @Prop({ default: false })
  banned: boolean = false;

  @Prop({ default: true })
  megagroup: boolean;

  @Prop({ default: false })
  reactRestricted: boolean = false;
}

export const ActiveChannelSchema = SchemaFactory.createForClass(ActiveChannel);

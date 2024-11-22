import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ required: true })
  transactionId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  issue: string;

  @Prop()
  refundMethod: string;

  @Prop()
  transactionImageUrl: string;

  @Prop({ required: true })
  profile: string;

  @Prop({ required: true })
  chatId: string;

  @Prop({ required: true })
  ipAddress: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

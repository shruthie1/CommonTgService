import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ required: false })
  transactionId: string;

  @Prop({ required: false })
  amount: number;

  @Prop({ required: false })
  issue: string;

  @Prop({ required: false })
  description: string;

  @Prop({ required: false })
  refundMethod?: string;

  @Prop({ required: false })
  profile: string;

  @Prop({ required: false })
  chatId: string;

  @Prop({ required: false })
  ipAddress: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

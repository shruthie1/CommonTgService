import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({
  versionKey: false,
  autoIndex: true,
  strict: false,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
    },
  },
})
export class Transaction {
  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  timestamp: number;

  @Prop({ required: true })
  type: string;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  metadata: any;

  @Prop()
  paymentId?: string;

  @Prop()
  orderId?: string;

  @Prop()
  signature?: string;

  @Prop()
  currency?: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ clientId: 1, timestamp: -1 });

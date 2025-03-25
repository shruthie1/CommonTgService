import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../dto/create-transaction.dto';

export type TransactionDocument = Transaction & Document;

@Schema({
  collection: 'transactions',
  versionKey: false,
  autoIndex: true,
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  }
})
export class Transaction {
  @ApiProperty({ description: 'Unique transaction ID (UTR)' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    required: true, 
    unique: true,
    index: true 
  })
  transactionId: string;

  @ApiProperty({ description: 'Amount involved in the transaction' })
  @Prop({ 
    type: MongooseSchema.Types.Number, 
    required: true,
    min: 0 
  })
  amount: number;

  @ApiProperty({ description: 'Issue type reported by the user' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    required: true,
    index: true
  })
  issue: string;

  @ApiProperty({ description: 'Description of issue reported by the user' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    required: true 
  })
  description: string;

  @ApiProperty({ description: 'Refund method selected by the user' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    default: 'undefined',
    index: true
  })
  refundMethod: string;

  @ApiProperty({ description: 'User profile ID' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    default: 'undefined',
    index: true
  })
  profile: string;

  @ApiProperty({ description: 'User chat ID' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    default: 'undefined',
    index: true
  })
  chatId: string;

  @ApiProperty({ description: 'IP address of the user' })
  @Prop({ 
    type: MongooseSchema.Types.String, 
    default: 'undefined' 
  })
  ip: string;

  @ApiProperty({ 
    description: 'Transaction status',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING
  })
  @Prop({
    type: MongooseSchema.Types.String,
    enum: Object.values(TransactionStatus),
    default: TransactionStatus.PENDING,
    index: true
  })
  status: TransactionStatus;

  @ApiProperty({ description: 'Creation timestamp' })
  @Prop({ type: Date })
  createdAt?: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Prop({ type: Date })
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Compound indexes for common query patterns
TransactionSchema.index({ chatId: 1, status: 1 });
TransactionSchema.index({ profile: 1, status: 1 });
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ amount: 1, status: 1 });

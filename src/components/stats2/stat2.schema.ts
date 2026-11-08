import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type Stat2Document = Stat2 & Document;

@Schema()
export class Stat2 {
  @ApiProperty({ description: 'Chat ID' })
  @Prop({ required: true })
  chatId: string;

  @ApiProperty({ description: 'Count' })
  @Prop({ required: true })
  count: number;

  @ApiProperty({ description: 'Pay Amount' })
  @Prop({ required: true })
  payAmount: number;

  @ApiProperty({ description: 'Demo Given' })
  @Prop({ required: true })
  demoGiven: boolean;

  @ApiProperty({ description: 'Demo Given Today' })
  @Prop({ required: true })
  demoGivenToday: boolean;

  @ApiProperty({ description: 'New User' })
  @Prop({ required: true })
  newUser: boolean;

  @ApiProperty({ description: 'Paid Reply' })
  @Prop({ required: true })
  paidReply: boolean;

  @ApiProperty({ description: 'Name' })
  @Prop({ required: true })
  name: string;

  @ApiProperty({ description: 'Second Show' })
  @Prop({ required: true })
  secondShow: boolean;

  @ApiProperty({ description: 'Client' })
  @Prop({ required: true })
  client: string;

  @ApiProperty({ description: 'Profile' })
  @Prop({ required: true })
  profile: string;

  @ApiProperty({ description: 'Paid channel-attribution credit timestamp', required: false })
  @Prop({ type: Number, required: false })
  paymentAttributionCreditedAt?: number;

  // F10 (data-model review 2026-11-08): written only by tg-platform through the raw driver (tg-db stats.repository.ts
  // markDailyPaid); CMS never writes them. Declared additively (optional, no default, no validator) so the schema
  // documents the stored shape. dailyRevenueCounted is Mixed, not Number: a Number path cast-fails on hydration of a
  // NaN value, and Mixed never casts, so existing reads cannot change. Canonical type: number.
  /** IST day key (YYYY-MM-DD) of the last counted payment. */
  @Prop({ type: String, required: false })
  dailyPaidCountedAt?: string;

  /** Revenue already counted for dailyPaidCountedAt (canonical: number). */
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  dailyRevenueCounted?: number;
}

export const StatSchema = SchemaFactory.createForClass(Stat2);
StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });

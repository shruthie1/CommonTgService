import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type StatDocument = Stat & Document;

@Schema()
export class Stat {
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

  @ApiProperty({ description: 'Did Pay' })
  @Prop({ required: false })
  didPay: boolean | null;

  @ApiProperty({ description: 'Client' })
  @Prop({ required: true })
  client: string;

  @ApiProperty({ description: 'Profile' })
  @Prop({ required: true })
  profile: string;
}

export const StatSchema = SchemaFactory.createForClass(Stat);
StatSchema.index({ chatId: 1, profile: 1, client: 1 }, { unique: true });

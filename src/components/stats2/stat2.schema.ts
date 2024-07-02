import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type Stat2Document = Stat2 & Document;

@Schema()
export class Stat2 {
  @ApiProperty({ example: '6785668464', description: 'Chat ID' })
  @Prop({ required: true })
  chatId: string;

  @ApiProperty({ example: 12, description: 'Count' })
  @Prop({ required: true })
  count: number;

  @ApiProperty({ example: 50, description: 'Pay Amount' })
  @Prop({ required: true })
  payAmount: number;

  @ApiProperty({ example: true, description: 'Demo Given' })
  @Prop({ required: true })
  demoGiven: boolean;

  @ApiProperty({ example: true, description: 'Demo Given Today' })
  @Prop({ required: true })
  demoGivenToday: boolean;

  @ApiProperty({ example: false, description: 'New User' })
  @Prop({ required: true })
  newUser: boolean;

  @ApiProperty({ example: true, description: 'Paid Reply' })
  @Prop({ required: true })
  paidReply: boolean;

  @ApiProperty({ example: 'Amaan Khan', description: 'Name' })
  @Prop({ required: true })
  name: string;

  @ApiProperty({ example: false, description: 'Second Show' })
  @Prop({ required: true })
  secondShow: boolean;

  @ApiProperty({ example: null, description: 'Did Pay' })
  @Prop({ required: false })
  didPay: boolean | null;

  @ApiProperty({ example: 'shruthi1', description: 'Client' })
  @Prop({ required: true })
  client: string;

  @ApiProperty({ example: 'shruthi', description: 'Profile' })
  @Prop({ required: true })
  profile: string;
}

export const StatSchema = SchemaFactory.createForClass(Stat2);
StatSchema.index({ chatId: 1, profile: 1 }, { unique: true });

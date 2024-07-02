import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type PromoteStatDocument = PromoteStat & Document;

@Schema()
export class PromoteStat {
  @ApiProperty({ example: 'shruthi1', description: 'Client ID' })
  @Prop({ required: true, unique: true })
  client: string;

  @ApiProperty({ example: { "Girls_Chating_Group_07": 4, "girls_friends_chatting_group_01": 14 }, description: 'Data' })
  @Prop({ required: true, type: Map, of: Number })
  data: Map<string, number>;

  @ApiProperty({ example: 552, description: 'Total Count' })
  @Prop({ required: true })
  totalCount: number;

  @ApiProperty({ example: 314, description: 'Unique Channels' })
  @Prop({ required: true })
  uniqueChannels: number;

  @ApiProperty({ example: 1719929752982.0, description: 'Release Day' })
  @Prop({ required: true })
  releaseDay: number;

  @ApiProperty({ example: 1719860106247.0, description: 'Last Updated TimeStamp' })
  @Prop({ required: true })
  lastupdatedTimeStamp: number;

  @ApiProperty({ example: true, description: 'Is Active' })
  @Prop({ required: true })
  isActive: boolean;

  @ApiProperty({ example: 1719929752982.0, description: 'Last Updated TimeStamp' })
  @Prop({ required: true })
  lastUpdatedTimeStamp: number;

  @ApiProperty({ example: ["And_Girls_Boys_Group_Chatting", "Girls_Chating_Group_07"], description: 'Channels' })
  @Prop({ required: true, type: [String] })
  channels: string[];
}

export const PromoteStatSchema = SchemaFactory.createForClass(PromoteStat);

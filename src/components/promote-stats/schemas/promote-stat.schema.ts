import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

export type PromoteStatDocument = PromoteStat & Document;

@Schema()
export class PromoteStat {
  @ApiProperty({ description: 'Client ID' })
  @Prop({ required: true, unique: true })
  client: string;

  @ApiProperty({ description: 'Data' })
  @Prop({ required: true, type: Map, of: Number })
  data: Map<string, number>;

  @ApiProperty({ description: 'Total Count' })
  @Prop({ required: true })
  totalCount: number;

  @ApiProperty({ description: 'Unique Channels' })
  @Prop({ required: true })
  uniqueChannels: number;

  @ApiProperty({ description: 'Release Day' })
  @Prop({ required: true })
  releaseDay: number;

  @ApiProperty({ description: 'Is Active' })
  @Prop({ required: true })
  isActive: boolean;

  @ApiProperty({ description: 'Last Updated TimeStamp' })
  @Prop({ required: true })
  lastUpdatedTimeStamp: number;

  @ApiProperty({ description: 'Channels' })
  @Prop({ required: true, type: [String] })
  channels: string[];
}

export const PromoteStatSchema = SchemaFactory.createForClass(PromoteStat);

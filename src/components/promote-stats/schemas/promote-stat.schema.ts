import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document, Schema as MongooseSchema } from 'mongoose';

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

  // F10 (data-model review 2026-11-08): written only by tg-platform through the raw driver (tg-db promote.repository.ts:
  // $inc count, boot-stamp mobile); CMS code never writes them. Declared additively (optional, no default, no
  // validator). count is Mixed, not Number: legacy rows hold strings/NaN (tg-db promote-stats.normalize.ts) and a
  // Number path would cast them on read or cast-fail; Mixed never casts. Canonical type: number.
  /** Per-session promotion count (canonical: number; legacy rows may hold strings/NaN). */
  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  count?: number;

  /** Account the last tg boot stamp was for (absent on older docs). */
  @Prop({ type: String, required: false })
  mobile?: string;
}

export const PromoteStatSchema = SchemaFactory.createForClass(PromoteStat);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// These collections are WRITTEN by the promote-clients / tg-aut services (one doc per
// {date, namespace, clientId, mobile}, live $inc, TTL-expiring after 14 days). `namespace`
// distinguishes promote-clients rows from tg-aut rows; `mobile` breaks out promote-clients'
// multi-mobile-per-clientId processes so one row is never a blend of several accounts.
// CommonTgService only READS them for the dashboard, so the schemas are permissive
// (strict: false) and never write. Old pre-mobile {date, clientId} docs still parse fine
// (namespace/mobile simply come back undefined for them).

@Schema({ collection: 'promoteStatsDaily', strict: false })
export class PromoteStatDaily {
  @Prop() date: string;          // "YYYY-MM-DD" (IST)
  @Prop() namespace?: string;    // 'promote-clients' | 'tg-aut'
  @Prop() clientId: string;
  @Prop() mobile?: string;
  @Prop() profile?: string;
  @Prop() sent?: number;
  @Prop() success?: number;
  @Prop() failed?: number;
  @Prop() banned?: number;
  @Prop() expireAt?: Date;
}
export type PromoteStatDailyDocument = HydratedDocument<PromoteStatDaily>;
export const PromoteStatDailySchema = SchemaFactory.createForClass(PromoteStatDaily);

@Schema({ collection: 'reactionStatsDaily', strict: false })
export class ReactionStatDaily {
  @Prop() date: string;
  @Prop() namespace?: string;
  @Prop() clientId: string;
  @Prop() mobile?: string;
  @Prop() profile?: string;
  @Prop() success?: number;
  @Prop() failed?: number;
  @Prop() restricted?: number;
  @Prop() floods?: number;
  @Prop() expireAt?: Date;
}
export type ReactionStatDailyDocument = HydratedDocument<ReactionStatDaily>;
export const ReactionStatDailySchema = SchemaFactory.createForClass(ReactionStatDaily);

@Schema({ collection: 'userStatsDaily', strict: false })
export class UserStatDaily {
  @Prop() date: string;
  @Prop() namespace?: string;
  @Prop() clientId: string;
  @Prop() mobile?: string;
  @Prop() profile?: string;
  @Prop() newUsers?: number;
  @Prop() active?: number;
  @Prop() paid?: number;
  @Prop() revenue?: number;
  @Prop() expireAt?: Date;
}
export type UserStatDailyDocument = HydratedDocument<UserStatDaily>;
export const UserStatDailySchema = SchemaFactory.createForClass(UserStatDaily);

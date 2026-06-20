import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';

export class SearchChannelDto {
  @ApiPropertyOptional({
    description: 'Unique identifier for the channel' })
  channelId?: string;

  @ApiPropertyOptional({
    description: 'Title of the channel' })
  title?: string;

  @ApiPropertyOptional({
    description: 'privacy of the channel' })
  private?: string;

  @ApiPropertyOptional({
    description: 'Username of the channel' })
  username?: string;

  @ApiPropertyOptional({
    description: 'Indicates if the channel can send messages' })
  // The global ValidationPipe uses enableImplicitConversion, which coerces a `boolean`-typed
  // property via Boolean(value) — and Boolean("false") === true, inverting `?canSendMsgs=false`.
  // The @Transform alone is overridden by implicit conversion when the design-type is `boolean`,
  // so we widen the type to `boolean | string` (emitted as Object → no implicit Boolean()) and let
  // the transform produce the real boolean.
  @Transform(({ value }: TransformFnParams) =>
    value === undefined ? undefined : (value === 'true' || value === true))
  canSendMsgs?: boolean | string;

  @ApiPropertyOptional({
    description: 'Minimum number of participants in the channel' })
  minParticipantsCount?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of participants in the channel' })
  maxParticipantsCount?: number;
}

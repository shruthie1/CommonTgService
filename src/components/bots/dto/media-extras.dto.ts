import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MediaOptionsDto } from './media.dto';

export class VoiceOptionsDto extends MediaOptionsDto {
  @ApiProperty({
    description: 'Duration of the voice message in seconds',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  duration?: number;
}

export class SendVoiceDto {
  @ApiProperty({
    description: 'Voice message URL or file ID',
    example: 'https://example.com/voice.ogg',
  })
  @IsString()
  voice: string;

  @ApiProperty({
    description: 'Voice sending options',
    required: false,
    type: () => VoiceOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceOptionsDto)
  options?: VoiceOptionsDto;
}

export class AnimationOptionsDto extends MediaOptionsDto {
  @ApiProperty({ description: 'Duration of the animation in seconds', required: false })
  @IsNumber()
  @IsOptional()
  duration?: number;

  @ApiProperty({ description: 'Animation width', required: false })
  @IsNumber()
  @IsOptional()
  width?: number;

  @ApiProperty({ description: 'Animation height', required: false })
  @IsNumber()
  @IsOptional()
  height?: number;
}

export class SendAnimationDto {
  @ApiProperty({
    description: 'Animation (GIF/MP4) URL or file ID',
    example: 'https://example.com/animation.gif',
  })
  @IsString()
  animation: string;

  @ApiProperty({
    description: 'Animation sending options',
    required: false,
    type: () => AnimationOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnimationOptionsDto)
  options?: AnimationOptionsDto;
}

export class StickerOptionsDto extends MediaOptionsDto {
  @ApiProperty({
    description: 'Emoji associated with the sticker',
    required: false,
    example: '😊',
  })
  @IsString()
  @IsOptional()
  emoji?: string;
}

export class SendStickerDto {
  @ApiProperty({
    description: 'Sticker URL or file ID',
    example: 'https://example.com/sticker.webp',
  })
  @IsString()
  sticker: string;

  @ApiProperty({
    description: 'Sticker sending options',
    required: false,
    type: () => StickerOptionsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StickerOptionsDto)
  options?: StickerOptionsDto;
}

import { MediaOptionsDto } from './media.dto';
export declare class VoiceOptionsDto extends MediaOptionsDto {
    duration?: number;
}
export declare class SendVoiceDto {
    voice: string;
    options?: VoiceOptionsDto;
}
export declare class AnimationOptionsDto extends MediaOptionsDto {
    duration?: number;
    width?: number;
    height?: number;
}
export declare class SendAnimationDto {
    animation: string;
    options?: AnimationOptionsDto;
}
export declare class StickerOptionsDto extends MediaOptionsDto {
    emoji?: string;
}
export declare class SendStickerDto {
    sticker: string;
    options?: StickerOptionsDto;
}

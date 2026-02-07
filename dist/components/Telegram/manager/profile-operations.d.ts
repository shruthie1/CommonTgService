import { TgContext, PrivacyBatchSettings } from './types';
export declare function updatePrivacy(ctx: TgContext): Promise<void>;
export declare function updatePrivacyforDeletedAccount(ctx: TgContext): Promise<void>;
export declare function updatePrivacyBatch(ctx: TgContext, settings: PrivacyBatchSettings): Promise<boolean>;
export declare function updateProfile(ctx: TgContext, firstName: string, about: string): Promise<void>;
export declare function updateUsername(ctx: TgContext, baseUsername: string): Promise<string>;
export declare function updateProfilePic(ctx: TgContext, image: string): Promise<void>;
export declare function downloadProfilePic(ctx: TgContext, photoIndex: number): Promise<string | undefined>;
export declare function deleteProfilePhotos(ctx: TgContext): Promise<void>;

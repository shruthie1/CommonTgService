import TelegramManager from '../Telegram/TelegramManager';
export type OrganicIntensity = 'light' | 'medium' | 'full';
export declare function performOrganicActivity(client: TelegramManager, intensity?: OrganicIntensity): Promise<void>;

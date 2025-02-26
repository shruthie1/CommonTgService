export declare enum NotificationSound {
    DEFAULT = "default",
    NONE = "none",
    CUSTOM = "custom"
}
export declare class NotificationSettingsDto {
    showPreviews?: boolean;
    silent?: boolean;
    sound?: NotificationSound;
    muteUntil?: number;
}
export declare class ChatNotificationSettingsDto {
    chatId: string;
    settings: NotificationSettingsDto;
}

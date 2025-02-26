export interface ContentFilter {
    chatId: string;
    keywords?: string[];
    mediaTypes?: ('photo' | 'video' | 'document')[];
    actions: ('delete' | 'warn' | 'mute')[];
}
export interface BackupOptions {
    backupId?: string;
    chatIds?: string[];
    includeMedia?: boolean;
    exportFormat?: 'json' | 'html';
    outputPath?: string;
    mediaTypes?: ('photo' | 'video' | 'document' | 'audio')[];
    restoreToChat?: string;
}
export interface MediaAlbumOptions {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video';
        url: string;
        caption?: string;
    }>;
}

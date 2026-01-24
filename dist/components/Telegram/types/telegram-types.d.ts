export interface ContentFilter {
    chatId: string;
    keywords?: string[];
    mediaTypes?: ('photo' | 'video' | 'document')[];
    actions: ('delete' | 'warn' | 'mute')[];
}
export interface MediaAlbumOptions {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video';
        url: string;
        caption?: string;
        filename?: string;
    }>;
}

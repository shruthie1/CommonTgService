export interface ActiveClientSetup {
    days?: number;
    archiveOld: boolean;
    formalities: boolean;
    newMobile: string;
    existingMobile: string;
    clientId: string;
}
export interface MediaMessageMetadata {
    messageId: number;
    mediaType: 'photo' | 'video';
    thumb: string | null;
}

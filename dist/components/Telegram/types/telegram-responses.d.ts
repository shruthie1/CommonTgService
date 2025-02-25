export interface ChannelInfo {
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
}
export interface MediaMetadata {
    photoCount: number;
    videoCount: number;
    movieCount: number;
    total: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
}

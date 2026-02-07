export declare class CreateUserDto {
    mobile: string;
    session: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    channels: number;
    personalChats: number;
    msgs: number;
    totalChats: number;
    lastActive: string;
    tgId: string;
    twoFA: boolean;
    expired: boolean;
    password: string;
    movieCount: number;
    photoCount: number;
    videoCount: number;
    gender?: string | null;
    otherPhotoCount: number;
    otherVideoCount: number;
    ownPhotoCount: number;
    ownVideoCount: number;
    contacts: number;
    calls: {
        totalCalls: number;
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
        chats: any[];
    };
    recentUsers: any[];
}

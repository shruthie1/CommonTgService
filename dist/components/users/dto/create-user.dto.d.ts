export declare class CreateUserDto {
    mobile: string;
    session: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    channels: number;
    personalChats: number;
    demoGiven: boolean;
    msgs: number;
    totalChats: number;
    lastActive: number;
    date: string;
    tgId: string;
    lastUpdated: string;
    twoFA: boolean;
    password: boolean;
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
        outgoing: number;
        incoming: number;
        video: number;
        chatCallCounts: any[];
        totalCalls: number;
    };
}

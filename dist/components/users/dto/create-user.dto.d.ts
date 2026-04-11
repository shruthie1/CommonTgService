export declare class UserCallsDto {
    totalCalls: number;
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
}
export declare class CreateUserDto {
    mobile: string;
    session: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
    tgId: string;
    gender?: string | null;
    twoFA: boolean;
    expired: boolean;
    password: string;
    channels: number;
    personalChats: number;
    totalChats: number;
    contacts: number;
    msgs: number;
    photoCount: number;
    videoCount: number;
    movieCount: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
    lastActive: string | null;
    calls?: UserCallsDto;
}

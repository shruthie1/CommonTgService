export declare class CreateEventDto {
    chatId: string;
    time: number;
    type: 'call' | 'message';
    profile: string;
    payload?: any;
}

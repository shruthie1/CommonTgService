export declare class CreateEventDto {
    chatId: string;
    time: number;
    type: 'call' | 'message';
    clientId: string;
    payload?: any;
}

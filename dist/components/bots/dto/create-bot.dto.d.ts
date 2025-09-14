import { ChannelCategory } from '../bots.service';
export declare class CreateBotDto {
    token: string;
    category: ChannelCategory;
    channelId: string;
    description?: string;
}

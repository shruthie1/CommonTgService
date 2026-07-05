import { ChannelCategory } from '../channel-category.enum';
export declare class CreateBotDto {
    token: string;
    category: ChannelCategory;
    channelId: string;
    description?: string;
}

import { Api, TelegramClient } from "telegram";
import { EntityLike } from "telegram/define";
export declare function getProfilePics(client: TelegramClient, user?: EntityLike): Promise<Api.TypePhoto[]>;

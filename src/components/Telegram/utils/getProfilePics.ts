import { Api, TelegramClient } from "telegram";
import { EntityLike } from "telegram/define";

export async function getProfilePics(client: TelegramClient, user: EntityLike = "me") {
    const userPhotos = await client.invoke(new Api.photos.GetUserPhotos({ userId: user }));
    return userPhotos?.photos
}
import { Api, TelegramClient } from "telegram";

export async function deleteProfilePhotos(client: TelegramClient, photos?: Api.TypePhoto[]) {
    try {
        if (!photos) {
            const result = await client.invoke(
                new Api.photos.GetUserPhotos({
                    userId: "me"
                })
            );
            console.info(`Profile Pics found: ${result.photos.length}`)
            photos = result?.photos;
        }
        if (photos?.length > 0) {
            await client.invoke(
                new Api.photos.DeletePhotos({
                    id: <Api.TypeInputPhoto[]><unknown>photos
                }))
        }
        console.info("Deleted profile Photos");
    } catch (error) {
        throw error
    }
}
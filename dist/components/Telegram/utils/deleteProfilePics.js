"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProfilePhotos = deleteProfilePhotos;
const telegram_1 = require("telegram");
async function deleteProfilePhotos(client, photos) {
    try {
        if (!photos) {
            const result = await client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.info(`Profile Pics found: ${result.photos.length}`);
            photos = result?.photos;
        }
        if (photos?.length > 0) {
            await client.invoke(new telegram_1.Api.photos.DeletePhotos({
                id: photos
            }));
        }
        console.info("Deleted profile Photos");
    }
    catch (error) {
        throw error;
    }
}
//# sourceMappingURL=deleteProfilePics.js.map
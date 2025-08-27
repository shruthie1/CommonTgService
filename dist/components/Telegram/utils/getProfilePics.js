"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfilePics = getProfilePics;
const telegram_1 = require("telegram");
async function getProfilePics(client, user = "me") {
    const userPhotos = await client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: user }));
    return userPhotos?.photos;
}
//# sourceMappingURL=getProfilePics.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomEmoji = getRandomEmoji;
exports.getCuteEmoji = getCuteEmoji;
function getRandomEmoji() {
    const eroticEmojis = ["🔥", "💋", "👅", "🍆", "🔥", "💋", " 🙈", "👅", "🍑", "🍆", "💦", "🍑", "😚", "😏", "💦", "🥕", "🥖"];
    const randomIndex = Math.floor(Math.random() * eroticEmojis.length);
    return eroticEmojis[randomIndex];
}
function getCuteEmoji() {
    const girlishEmojis = [
        "🌸", "💖", "💅", "✨", "💐", "🎀", "🌷", "🦋", "💞",
        "💫", "🌈", "🍓", "🧁", "🌺", "🥰", "😊", "💕", "🌻"
    ];
    const randomIndex = Math.floor(Math.random() * girlishEmojis.length);
    return girlishEmojis[randomIndex];
}
//# sourceMappingURL=getRandomEmoji.js.map
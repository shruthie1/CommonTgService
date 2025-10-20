"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomEmoji = getRandomEmoji;
exports.getCuteEmoji = getCuteEmoji;
exports.getRandomPetName = getRandomPetName;
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
function getRandomPetName() {
    const cuteDesiEnglishPetNames = [
        "Cuti", 'Cutie', "Sweety", "Shinny", 'Shiney', "Bubli",
        "Cuddly", "Sparkle", "Hunny", "Twinkle", "Bunni", "Cuppy",
        "Jelly", "Rosy", "Starry", "Dolly",
        "Pinku", "Glitzy", "Chirpy", "Mishu", "Dreamy",
        "Lovely", "Puppy", "Kuttie", "Rinkly", "Bouncy"
    ];
    const randomIndex = Math.floor(Math.random() * cuteDesiEnglishPetNames.length);
    return cuteDesiEnglishPetNames[randomIndex];
}
//# sourceMappingURL=getRandomEmoji.js.map
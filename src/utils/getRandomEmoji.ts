export function getRandomEmoji(): string {
    const eroticEmojis: string[] = ["🔥", "💋", "👅", "🍆", "🔥", "💋", " 🙈", "👅", "🍑", "🍆", "💦", "🍑", "😚", "😏", "💦", "🥕", "🥖"];
    const randomIndex = Math.floor(Math.random() * eroticEmojis.length);
    return eroticEmojis[randomIndex];
}

export function getCuteEmoji(): string {
    const girlishEmojis: string[] = [
        "🌸", "💖", "💅", "✨", "💐", "🎀", "🌷", "🦋", "💞",
        "💫", "🌈", "🍓", "🧁", "🌺", "🥰", "😊", "💕", "🌻"
    ];
    const randomIndex = Math.floor(Math.random() * girlishEmojis.length);
    return girlishEmojis[randomIndex];
}

export function getRandomPetName(): string {
    const cuteDesiEnglishPetNames: string[] = [
        "Cuti", 'Cutie', "Sweety", "Shinny", 'Shiney', "Bubli",
        "Cuddly", "Sparkle", "Hunny", "Twinkle", "Bunni", "Cuppy",
        "Jelly", "Rosy", "Starry", "Dolly",
        "Pinku", "Glitzy", "Chirpy", "Mishu", "Dreamy",
        "Lovely", "Puppy", "Kuttie", "Rinkly", "Bouncy"
    ];
    const randomIndex = Math.floor(Math.random() * cuteDesiEnglishPetNames.length);
    return cuteDesiEnglishPetNames[randomIndex];
}
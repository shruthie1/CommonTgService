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

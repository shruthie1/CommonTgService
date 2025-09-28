export function getRandomEmoji(): string {
    const eroticEmojis: string[] = ["🔥", "💋", "👅", "🍆", "🔥", "💋", " 🙈", "👅", "🍑", "🍆", "💦", "🍑", "😚", "😏", "💦", "🥕", "🥖"];
    const randomIndex = Math.floor(Math.random() * eroticEmojis.length);
    return eroticEmojis[randomIndex];
}

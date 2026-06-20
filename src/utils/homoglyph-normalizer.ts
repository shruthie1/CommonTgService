/**
 * Homoglyph Normalizer
 *
 * Reverses homoglyph substitution applied by obfuscateText.ts.
 * Used to compare a TG profile's obfuscated name/bio against the
 * originally assigned base values during warmup verification.
 */

// Forward map duplicated from obfuscateText.ts — intentionally not imported
// so this module stays dependency-free and easy to test in isolation.
const forwardMap: Record<string, string[]> = {
    a: ['а', 'ɑ', 'ᴀ', 'α', '⍺'],
    b: ['Ь', 'ʙ', 'в', 'Ƅ', 'ɓ'],
    c: ['ϲ', 'ᴄ', 'с', 'ℂ', 'ⅽ'],
    d: ['ԁ', 'ժ', 'ɗ', 'ᴅ', 'ɖ'],
    e: ['е', 'ҽ', 'ɛ', 'ɘ'],
    f: ['ғ', 'ƒ', 'ꝼ', 'ϝ', 'ʄ'],
    g: ['ɡ', 'ɢ', 'ց', 'ɠ', 'ǥ'],
    h: ['һ', 'н', 'ḩ'],
    i: ['і', 'ì', 'í'],
    j: ['ј', 'ʝ', 'ɉ', 'ĵ', 'ǰ', 'ɟ'],
    k: ['κ', 'ᴋ', 'қ', 'ƙ', 'ĸ'],
    l: ['ⅼ', 'ʟ', 'ŀ', 'ɭ'],
    m: ['м', 'ᴍ', 'ɱ'],
    n: ['ո', 'п', 'ռ', 'ᴎ', 'ɲ', 'ŋ'],
    o: ['о', 'օ', 'ᴏ', 'ο'],
    p: ['р', 'ρ', 'ᴩ', 'ƥ', 'þ', 'ᵽ'],
    q: ['ԛ', 'գ', 'ɋ', 'ʠ'],
    r: ['г', 'ᴦ', 'ʀ', 'ɾ', 'ɍ'],
    s: ['ѕ', 'ꜱ'],
    t: ['т', 'ᴛ', 'ƭ', 'ʈ'],
    u: ['υ', 'ᴜ', 'ս', 'ʊ', 'ų'],
    v: ['ѵ', 'ᴠ', 'ν', 'ʋ', 'ⱱ'],
    w: ['ԝ', 'ᴡ', 'ω', 'ɯ', 'ɰ'],
    x: ['х', 'χ'],
    y: ['у', 'γ', 'ү', 'ყ', 'ỵ'],
    z: ['ᴢ', 'ʐ', 'ʑ', 'ʒ'],
};

// Build reverse map: homoglyph char → ASCII equivalent
const reverseMap: Record<string, string> = {};
for (const [ascii, homoglyphs] of Object.entries(forwardMap)) {
    for (const glyph of homoglyphs) {
        reverseMap[glyph] = ascii;
    }
}

/**
 * Replaces all known homoglyph characters in `text` with their ASCII equivalents.
 * Non-mapped characters are left as-is.
 */
export function normalizeHomoglyphs(text: string): string {
    let result = '';
    for (const char of text) {
        result += reverseMap[char] ?? char;
    }
    return result;
}

/**
 * Emoji and symbol regex — matches any character in Unicode Emoji or
 * Symbol blocks so we can strip decorative emoji from TG display names.
 */
const EMOJI_REGEX =
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}]/gu;

/**
 * Strips emoji and trims whitespace from a display string, then normalizes homoglyphs.
 */
function cleanDisplayName(name: string): string {
    return normalizeHomoglyphs(name.replace(EMOJI_REGEX, '').trim());
}

/**
 * Returns true when the TG profile's first name (possibly obfuscated and/or
 * decorated with emoji) contains the assigned first name as a case-insensitive
 * substring.  This tolerates pet-name suffixes like "Priya baby".
 */
export function nameMatchesAssignment(
    tgFirstName: string,
    assignedFirstName: string,
): boolean {
    const normalized = cleanDisplayName(tgFirstName).toLowerCase();
    const assigned = assignedFirstName.toLowerCase().trim();
    // An empty assigned (or empty TG) name must never count as a match — includes('') is
    // always true, which would falsely "verify" any profile against an unset assignment.
    if (!assigned || !normalized) return false;
    return normalized.includes(assigned);
}

/**
 * Returns true when the TG last name matches the assigned last name exactly,
 * or when `assignedLastName` is null (meaning no last name was assigned).
 */
export function lastNameMatches(
    tgLastName: string | null,
    assignedLastName: string | null,
): boolean {
    if (assignedLastName === null) return true;
    return tgLastName === assignedLastName;
}

/**
 * Returns true when the TG bio matches the assigned bio exactly,
 * or when `assignedBio` is null (meaning no bio was assigned).
 */
export function bioMatches(
    currentBio: string | null,
    assignedBio: string | null,
): boolean {
    if (assignedBio === null) return true;
    return currentBio === assignedBio;
}

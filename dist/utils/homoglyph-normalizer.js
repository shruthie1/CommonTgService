"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHomoglyphs = normalizeHomoglyphs;
exports.nameMatchesAssignment = nameMatchesAssignment;
exports.lastNameMatches = lastNameMatches;
exports.bioMatches = bioMatches;
const forwardMap = {
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
const reverseMap = {};
for (const [ascii, homoglyphs] of Object.entries(forwardMap)) {
    for (const glyph of homoglyphs) {
        reverseMap[glyph] = ascii;
    }
}
function normalizeHomoglyphs(text) {
    let result = '';
    for (const char of text) {
        result += reverseMap[char] ?? char;
    }
    return result;
}
const EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}]/gu;
function cleanDisplayName(name) {
    return normalizeHomoglyphs(name.replace(EMOJI_REGEX, '').trim());
}
function nameMatchesAssignment(tgFirstName, assignedFirstName) {
    const normalized = cleanDisplayName(tgFirstName).toLowerCase();
    const assigned = assignedFirstName.toLowerCase().trim();
    return normalized.includes(assigned);
}
function lastNameMatches(tgLastName, assignedLastName) {
    if (assignedLastName === null)
        return true;
    return tgLastName === assignedLastName;
}
function bioMatches(currentBio, assignedBio) {
    if (assignedBio === null)
        return true;
    return currentBio === assignedBio;
}
//# sourceMappingURL=homoglyph-normalizer.js.map
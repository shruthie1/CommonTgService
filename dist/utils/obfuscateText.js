"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invisibleChars = exports.specialCharMap = exports.numberMap = exports.homoglyphMap = exports.SeededRandom = exports.ObfuscationConfig = void 0;
exports.obfuscateText = obfuscateText;
exports.analyzeText = analyzeText;
exports.attemptReverse = attemptReverse;
exports.attemptReverseFuzzy = attemptReverseFuzzy;
exports.testReverseCoverage = testReverseCoverage;
exports.batchObfuscate = batchObfuscate;
exports.generateVariants = generateVariants;
exports.validateConfig = validateConfig;
const DEFAULT_CONFIG = {
    substitutionRate: 0.4,
    invisibleCharRate: 0,
    preserveCase: false,
    preserveNumbers: false,
    preserveSpecialChars: true,
    useInvisibleChars: false,
    maintainFormatting: true,
    randomSeed: null,
    maxInvisibleCharsPerWord: 2,
    customSafeBlocks: [],
    intensityVariation: false
};
const homoglyphMap = {
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
    x: ['х', 'χ',],
    y: ['у', 'γ', 'ү', 'ყ', 'ỵ'],
    z: ['ᴢ', 'ʐ', 'ʑ', 'ʒ']
};
exports.homoglyphMap = homoglyphMap;
const numberMap = {
    '0': ['О', '𝟎', '𝟘', '𝟢', '𝟬', '𝟶'],
    '1': ['𝟏', '𝟙', '𝟣', '𝟭', '𝟷'],
    '2': ['𝟐', '𝟚', '𝟤', '𝟮', '𝟸'],
    '3': ['Ʒ', '𝟑', '𝟛', '𝟥', '𝟯', '𝟹', 'З'],
    '4': ['Ꮞ', '𝟒', '𝟜', '𝟦', '𝟰', '𝟺'],
    '5': ['Ƽ', '𝟓', '𝟝', '𝟧', '𝟱', '𝟻'],
    '6': ['б', '𝟔', '𝟞', '𝟨', '𝟲', '𝟼'],
    '7': ['７', '𝟕', '𝟟', '𝟩', '𝟳', '𝟽'],
    '8': ['𝟖', '𝟠', '𝟪', '𝟴', '𝟾'],
    '9': ['𝟗', '𝟡', '𝟫', '𝟵', '𝟿']
};
exports.numberMap = numberMap;
const specialCharMap = {
    ' ': ['\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200A', '\u00A0'],
    '.': ['․', '‧', '・', '⋅', '∘', '◦'],
    ',': ['‚', '،', '、', '︐'],
    '!': ['！', '❗', '❕', '¡'],
    '?': ['？', '❓', '❔', '¿'],
    ':': ['：', '︓', '⁚', '˸'],
    ';': ['；', '︔'],
    '-': ['‐', '‑', '‒', '–', '—', '―', '⸗', '−'],
    '(': ['❨', '❪', '⁽', '₍'],
    ')': ['❩', '❫', '⁾', '₎'],
    '[': ['❲', '［', '⁅'],
    ']': ['❳', '］', '⁆'],
    '{': ['❴', '｛'],
    '}': ['❵', '｝'],
    '"': ['"', '"', '‟', '❝', '❞'],
    "'": ['‛', '❛', '❜']
};
exports.specialCharMap = specialCharMap;
const invisibleChars = [
    '\u200B',
    '\u200C',
    '\u200D',
    '\u2060',
    '\uFEFF',
];
exports.invisibleChars = invisibleChars;
class ObfuscationConfig {
    constructor(options = {}) {
        const config = { ...DEFAULT_CONFIG, ...options };
        this.substitutionRate = config.substitutionRate;
        this.invisibleCharRate = config.invisibleCharRate;
        this.preserveCase = config.preserveCase;
        this.preserveNumbers = config.preserveNumbers;
        this.preserveSpecialChars = config.preserveSpecialChars;
        this.useInvisibleChars = config.useInvisibleChars;
        this.maintainFormatting = config.maintainFormatting;
        this.randomSeed = config.randomSeed;
        this.maxInvisibleCharsPerWord = config.maxInvisibleCharsPerWord;
        this.customSafeBlocks = Object.freeze([...config.customSafeBlocks]);
        this.intensityVariation = config.intensityVariation;
    }
    toJSON() {
        return {
            substitutionRate: this.substitutionRate,
            invisibleCharRate: this.invisibleCharRate,
            preserveCase: this.preserveCase,
            preserveNumbers: this.preserveNumbers,
            preserveSpecialChars: this.preserveSpecialChars,
            useInvisibleChars: this.useInvisibleChars,
            maintainFormatting: this.maintainFormatting,
            randomSeed: this.randomSeed,
            maxInvisibleCharsPerWord: this.maxInvisibleCharsPerWord,
            customSafeBlocks: [...this.customSafeBlocks],
            intensityVariation: this.intensityVariation
        };
    }
}
exports.ObfuscationConfig = ObfuscationConfig;
class SeededRandom {
    constructor(seed = null) {
        this.seed = seed ?? Math.random() * 2147483647;
        this.current = this.seed;
    }
    next() {
        this.current = (this.current * 16807) % 2147483647;
        return this.current / 2147483647;
    }
    choice(array) {
        if (array.length === 0) {
            throw new Error('Cannot choose from empty array');
        }
        return array[Math.floor(this.next() * array.length)];
    }
    chance(probability) {
        return this.next() < probability;
    }
    getSeed() {
        return this.seed;
    }
    reset() {
        this.current = this.seed;
    }
}
exports.SeededRandom = SeededRandom;
function getRandom(arr, weights) {
    if (arr.length === 0) {
        throw new Error('Cannot select from empty array');
    }
    if (!weights) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    if (weights.length !== arr.length) {
        throw new Error('Weights array must have same length as choices array');
    }
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        throw new Error('Total weight must be positive');
    }
    let random = Math.random() * totalWeight;
    for (let i = 0; i < arr.length; i++) {
        if (random < weights[i]) {
            return arr[i];
        }
        random -= weights[i];
    }
    return arr[arr.length - 1];
}
const defaultSafeBlocks = [
    '𝗩𝗲𝗱𝗶𝗼 𝗖𝗮𝗹𝗹 𝗗𝗲𝗺𝗼 𝗔𝘃𝗶𝗹𝗯𝗹𝗲',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '🔥🔥  T O D A Y \' S   O F F E R  🔥🔥',
    '🇻 🇮 🇩 🇪 🇴  🇨 🇦 𝗟 𝗟 ',
    '𝗠𝗢𝗢𝗗', '𝗨𝗡𝗗𝗜', '𝗜𝗗𝗘', '𝗜𝗥𝗨𝗞𝗞𝗨',
    '𝗛𝗔𝗜', '𝗛𝗔𝗜𝗥', '𝗛𝗔𝗜𝗥𝗘', '𝗗𝗠', '𝗖𝗛𝗘𝗬𝗬𝗜',
    '𝗕𝗢𝗬𝗦', '𝗚𝗔𝗥𝗔𝗠', '𝗛𝗨𝗠𝗔𝗜𝗥𝗔𝗠', '𝗛𝗔𝗜𝗥𝗘𝗦𝗦', '𝗔𝗥𝗘𝗔𝗦',
    '𝗖𝗔𝗟𝗟', '𝗡𝗢𝗪', '𝗗𝗔𝗥𝗟𝗜𝗡𝗚',
    '𝗝𝗢𝗜𝗡', '𝗙𝗔𝗦𝗧', '𝗧𝗜𝗠𝗘', '𝗡𝗢', '𝗛𝗔𝗜',
    '𝗟𝗘𝗧𝗦', '𝗛𝗔𝗩𝗘', '𝗛𝗢𝗧', '𝗩𝗜𝗗𝗘𝗢', '𝗖𝗔𝗟𝗟'
];
function obfuscateText(text, config = {}) {
    const settings = config instanceof ObfuscationConfig ? config : new ObfuscationConfig(config);
    const random = new SeededRandom(settings.randomSeed);
    const safeBlocks = [...defaultSafeBlocks, ...settings.customSafeBlocks];
    const specialCharCache = new Map();
    let obfuscated = '';
    const lines = text.split('\n');
    for (let j = 0; j < lines.length; j++) {
        const line = lines[j].replace(/\*\*/g, '');
        if (line.trim() === '') {
            obfuscated += '\n';
            continue;
        }
        const isSafe = safeBlocks.some((safe) => line.includes(safe));
        if (isSafe) {
            obfuscated += line + '\n';
            continue;
        }
        let newLine = '';
        let invisibleCharsInWord = 0;
        let isInWord = false;
        let currentSubstitutionRate = settings.substitutionRate;
        if (settings.intensityVariation) {
            const variation = (random.next() - 0.5) * 0.3;
            currentSubstitutionRate = Math.max(0.1, Math.min(0.9, currentSubstitutionRate + variation));
        }
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            const lower = c.toLowerCase();
            const isLetter = /[a-zA-Z]/.test(c);
            const isNumber = /[0-9]/.test(c);
            const isSpace = /\s/.test(c);
            if (isLetter || isNumber) {
                if (!isInWord) {
                    isInWord = true;
                    invisibleCharsInWord = 0;
                }
            }
            else if (isSpace) {
                isInWord = false;
                invisibleCharsInWord = 0;
            }
            let substituted = false;
            if (isLetter && homoglyphMap[lower] && random.chance(currentSubstitutionRate)) {
                const substitute = random.choice(homoglyphMap[lower]);
                newLine += settings.preserveCase && c === c.toUpperCase() ? substitute.toUpperCase() : substitute;
                substituted = true;
            }
            else if (isNumber && !settings.preserveNumbers && numberMap[c] && random.chance(currentSubstitutionRate)) {
                newLine += random.choice(numberMap[c]);
                substituted = true;
            }
            else if (!isLetter && !isNumber && !isSpace && !settings.preserveSpecialChars &&
                specialCharMap[c] && random.chance(currentSubstitutionRate * 0.3)) {
                if (specialCharCache.has(c)) {
                    newLine += specialCharCache.get(c);
                }
                else {
                    const sub = random.choice(specialCharMap[c]);
                    specialCharCache.set(c, sub);
                    newLine += sub;
                }
                substituted = true;
            }
            else {
                newLine += c;
            }
            if (settings.useInvisibleChars && isInWord && i > 0 &&
                invisibleCharsInWord < settings.maxInvisibleCharsPerWord &&
                (isLetter || isNumber) && random.chance(settings.invisibleCharRate)) {
                newLine += random.choice(invisibleChars);
                invisibleCharsInWord++;
            }
            if (settings.useInvisibleChars && substituted && random.chance(0.05)) {
                newLine += random.choice(invisibleChars);
            }
        }
        obfuscated += settings.maintainFormatting ? `**${newLine}**\n` : newLine + '\n';
    }
    return obfuscated.trim();
}
function analyzeText(text) {
    const stats = {
        totalChars: text.length,
        letters: 0,
        numbers: 0,
        specialChars: 0,
        obfuscatableLetters: 0,
        obfuscatableNumbers: 0,
        obfuscatableSpecial: 0,
        lines: text.split('\n').length,
        words: text.split(/\s+/).filter(word => word.length > 0).length
    };
    for (const char of text) {
        const lower = char.toLowerCase();
        if (/[a-zA-Z]/.test(char)) {
            stats.letters++;
            if (homoglyphMap[lower])
                stats.obfuscatableLetters++;
        }
        else if (/[0-9]/.test(char)) {
            stats.numbers++;
            if (numberMap[char])
                stats.obfuscatableNumbers++;
        }
        else if (!/\s/.test(char)) {
            stats.specialChars++;
            if (specialCharMap[char])
                stats.obfuscatableSpecial++;
        }
    }
    return stats;
}
function attemptReverse(obfuscatedText) {
    let cleaned = obfuscatedText;
    invisibleChars.forEach((char) => {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(char), 'g'), '');
    });
    const reverseMap = {};
    Object.entries(homoglyphMap).forEach(([original, substitutes]) => {
        substitutes.forEach((substitute) => {
            reverseMap[substitute.toLowerCase()] = original.toLowerCase();
            reverseMap[substitute.toUpperCase()] = original.toUpperCase();
            reverseMap[substitute] = original;
        });
    });
    Object.entries(numberMap).forEach(([original, substitutes]) => {
        substitutes.forEach((substitute) => {
            reverseMap[substitute] = original;
        });
    });
    Object.entries(specialCharMap).forEach(([original, substitutes]) => {
        substitutes.forEach((substitute) => {
            reverseMap[substitute] = original;
        });
    });
    const sortedMappings = Object.entries(reverseMap)
        .sort(([a], [b]) => b.length - a.length);
    for (const [obfuscated, original] of sortedMappings) {
        if (obfuscated && original && cleaned.includes(obfuscated)) {
            cleaned = cleaned.replace(new RegExp(escapeRegExp(obfuscated), 'g'), original);
        }
    }
    cleaned = cleaned.normalize('NFC');
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    return cleaned;
}
function attemptReverseFuzzy(obfuscatedText) {
    let cleaned = obfuscatedText;
    invisibleChars.forEach((char) => {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(char), 'g'), '');
    });
    let result = '';
    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        let bestMatch = char;
        let found = false;
        for (const [original, substitutes] of Object.entries(homoglyphMap)) {
            if (substitutes.includes(char.toLowerCase())) {
                bestMatch = char === char.toUpperCase() ? original.toUpperCase() : original;
                found = true;
                break;
            }
        }
        if (!found) {
            for (const [original, substitutes] of Object.entries(numberMap)) {
                if (substitutes.includes(char)) {
                    bestMatch = original;
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            for (const [original, substitutes] of Object.entries(specialCharMap)) {
                if (substitutes.includes(char)) {
                    bestMatch = original;
                    found = true;
                    break;
                }
            }
        }
        result += bestMatch;
    }
    result = result.normalize('NFC');
    result = result.replace(/\*\*(.*?)\*\*/g, '$1');
    return result;
}
function testReverseCoverage() {
    const reverseMap = {};
    Object.entries(homoglyphMap).forEach(([original, substitutes]) => {
        substitutes.forEach(sub => { reverseMap[sub] = original; });
    });
    Object.entries(numberMap).forEach(([original, substitutes]) => {
        substitutes.forEach(sub => { reverseMap[sub] = original; });
    });
    Object.entries(specialCharMap).forEach(([original, substitutes]) => {
        substitutes.forEach(sub => { reverseMap[sub] = original; });
    });
    const letterSubs = Object.values(homoglyphMap).flat();
    const numberSubs = Object.values(numberMap).flat();
    const specialSubs = Object.values(specialCharMap).flat();
    const lettersMapped = letterSubs.filter(sub => reverseMap[sub]).length;
    const numbersMapped = numberSubs.filter(sub => reverseMap[sub]).length;
    const specialMapped = specialSubs.filter(sub => reverseMap[sub]).length;
    return {
        letters: {
            total: letterSubs.length,
            mapped: lettersMapped,
            coverage: (lettersMapped / letterSubs.length) * 100
        },
        numbers: {
            total: numberSubs.length,
            mapped: numbersMapped,
            coverage: (numbersMapped / numberSubs.length) * 100
        },
        special: {
            total: specialSubs.length,
            mapped: specialMapped,
            coverage: (specialMapped / specialSubs.length) * 100
        }
    };
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function batchObfuscate(text, configArray) {
    return configArray.map(config => {
        const configObj = config instanceof ObfuscationConfig ? config : new ObfuscationConfig(config);
        const result = obfuscateText(text, configObj);
        const analysisStats = analyzeText(result);
        return {
            config: configObj,
            result,
            analysisStats
        };
    });
}
function generateVariants(text, baseConfig = {}, variants = 5) {
    const results = [];
    const config = new ObfuscationConfig(baseConfig);
    for (let i = 0; i < variants; i++) {
        const intensity = (i + 1) / variants;
        const variantConfig = new ObfuscationConfig({
            ...config.toJSON(),
            substitutionRate: intensity * 0.8,
            invisibleCharRate: intensity * 0.15,
            randomSeed: Math.floor(Math.random() * 1000000)
        });
        results.push(obfuscateText(text, variantConfig));
    }
    return results;
}
function validateConfig(config) {
    if (config.substitutionRate !== undefined && (config.substitutionRate < 0 || config.substitutionRate > 1)) {
        throw new Error('substitutionRate must be between 0 and 1');
    }
    if (config.invisibleCharRate !== undefined && (config.invisibleCharRate < 0 || config.invisibleCharRate > 1)) {
        throw new Error('invisibleCharRate must be between 0 and 1');
    }
    if (config.maxInvisibleCharsPerWord !== undefined && config.maxInvisibleCharsPerWord < 0) {
        throw new Error('maxInvisibleCharsPerWord must be non-negative');
    }
}
//# sourceMappingURL=obfuscateText.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultMessages = exports.defaultReactions = void 0;
exports.sleep = sleep;
exports.contains = contains;
exports.toBoolean = toBoolean;
exports.fetchNumbersFromString = fetchNumbersFromString;
exports.areJsonsNotSame = areJsonsNotSame;
exports.mapToJson = mapToJson;
exports.shouldMatch = shouldMatch;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function contains(str, arr) {
    if (!str || !Array.isArray(arr))
        return false;
    return arr.some(element => element && str.includes(element.toLowerCase()));
}
function toBoolean(value) {
    if (value === null || value === undefined)
        return false;
    if (typeof value === 'string') {
        const normalizedValue = value.toLowerCase().trim();
        return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    return value;
}
function fetchNumbersFromString(inputString) {
    if (!inputString)
        return '';
    const regex = /\d+/g;
    const matches = inputString.match(regex);
    return matches ? matches.join('') : '';
}
exports.defaultReactions = Object.freeze([
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
]);
exports.defaultMessages = Object.freeze([
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15",
    "16", "17", "18", "19", "20", "21"
]);
function areJsonsNotSame(json1, json2) {
    const keysToIgnore = ['id', '_id'];
    console.log('[areJsonsNotSame] Starting comparison...');
    function normalizeObject(obj) {
        if (obj === null || obj === undefined)
            return obj;
        if (typeof obj !== 'object')
            return obj;
        if (Array.isArray(obj))
            return obj.map(normalizeObject);
        const normalized = {};
        const sortedKeys = Object.keys(obj)
            .filter(key => !keysToIgnore.includes(key))
            .sort();
        for (const key of sortedKeys) {
            normalized[key] = normalizeObject(obj[key]);
        }
        return normalized;
    }
    const normalized1 = normalizeObject(json1);
    const normalized2 = normalizeObject(json2);
    return JSON.stringify(normalized1) !== JSON.stringify(normalized2);
}
function mapToJson(map) {
    if (!(map instanceof Map)) {
        throw new Error('Input must be a Map instance');
    }
    const obj = {};
    for (const [key, value] of map.entries()) {
        obj[String(key)] = value;
    }
    return obj;
}
function shouldMatch(obj) {
    const regex = /(wife|adult|lanj|chat|𝑭𝒂𝒎𝒊𝒍𝒚|𝙏𝙖𝙢𝙞𝙡|𝐒𝐖𝐀𝐏|lesb|aunty|girl|boy|tamil|kannad|telugu|hindi|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi)/i;
    const titleMatch = obj.title && regex.test(obj.title);
    const usernameMatch = obj.username && regex.test(obj.username);
    return !!(titleMatch || usernameMatch);
}
//# sourceMappingURL=common.js.map
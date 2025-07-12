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
    const keysToIgnore = ['id', '_id', 'createdAt', 'updatedAt', 'timestamp', 'time', 'date', 'timeStamp', 'created_at', 'updated_at'];
    const MAX_DEPTH = 10;
    function compare(obj1, obj2, path = '', depth = 0) {
        if (depth > MAX_DEPTH) {
            console.log(`[DEPTH LIMIT] Reached max depth at path: ${path}`);
            return obj1 !== obj2;
        }
        if (obj1 === null || obj1 === undefined || obj2 === null || obj2 === undefined) {
            if (obj1 !== obj2) {
                console.log(`[MISMATCH] ${path}: ${obj1} !== ${obj2}`);
                return true;
            }
            return false;
        }
        if (typeof obj1 !== typeof obj2) {
            console.log(`[MISMATCH] ${path}: type ${typeof obj1} !== ${typeof obj2}`);
            return true;
        }
        if (typeof obj1 !== 'object') {
            if (obj1 !== obj2) {
                console.log(`[MISMATCH] ${path}: ${obj1} !== ${obj2}`);
                return true;
            }
            return false;
        }
        if (Array.isArray(obj1) && Array.isArray(obj2)) {
            if (obj1.length !== obj2.length) {
                console.log(`[MISMATCH] ${path}: array length ${obj1.length} !== ${obj2.length}`);
                return true;
            }
            for (let i = 0; i < obj1.length; i++) {
                const arrayPath = path ? `${path}[${i}]` : `[${i}]`;
                if (compare(obj1[i], obj2[i], arrayPath, depth + 1)) {
                    return true;
                }
            }
            return false;
        }
        if (Array.isArray(obj1) || Array.isArray(obj2)) {
            console.log(obj1, obj2);
            console.log(`[MISMATCH] ${path}: one is array, other is not`);
            return true;
        }
        const record1 = obj1;
        const record2 = obj2;
        const keys1 = Object.keys(record1).filter(key => !keysToIgnore.includes(key));
        const keys2 = Object.keys(record2).filter(key => !keysToIgnore.includes(key));
        if (keys1.length !== keys2.length) {
            console.log(`[MISMATCH] ${path}: different key count ${keys1.length} !== ${keys2.length}`);
            console.log(`[KEYS] obj1: [${keys1.join(', ')}]`);
            console.log(`[KEYS] obj2: [${keys2.join(', ')}]`);
            return true;
        }
        for (const key of keys1) {
            if (!keys2.includes(key)) {
                console.log(`[MISMATCH] ${path}: key "${key}" missing in obj2`);
                return true;
            }
        }
        for (const key of keys1) {
            const keyPath = path ? `${path}.${key}` : key;
            if (compare(record1[key], record2[key], keyPath, depth + 1)) {
                return true;
            }
        }
        return false;
    }
    const result = compare(json1, json2);
    console.log(`[COMPARISON END] Result: ${result ? 'DIFFERENT' : 'SAME'}`);
    return result;
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
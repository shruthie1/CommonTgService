"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapToJson = exports.areJsonsNotSame = exports.defaultMessages = exports.defaultReactions = exports.ppplbot = exports.parseError = exports.fetchNumbersFromString = exports.toBoolean = exports.fetchWithTimeout = exports.contains = exports.sleep = void 0;
const axios_1 = __importDefault(require("axios"));
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.sleep = sleep;
function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }));
}
exports.contains = contains;
;
async function fetchWithTimeout(resource, options = {}, maxRetries = 1) {
    options.timeout = options.timeout || 50000;
    options.method = options.method || 'GET';
    options.enableBypass = options.enableBypass ?? true;
    options.bypassUrl = options.bypassUrl || process.env.bypassURL;
    const tryOriginalRequest = async () => {
        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
            try {
                const responseIPv4 = await fetchWithProtocol(resource, 4, options);
                if (responseIPv4) {
                    if (responseIPv4.status === 403 && options.enableBypass && options.bypassUrl) {
                        try {
                            const bypassResponse = await (0, axios_1.default)({
                                url: options.bypassUrl,
                                method: 'POST',
                                data: {
                                    url: resource,
                                    method: options.method,
                                    headers: options.headers,
                                    data: options.data,
                                    params: options.params
                                },
                                timeout: options.timeout,
                                validateStatus: () => true
                            });
                            return bypassResponse;
                        }
                        catch (bypassError) {
                            console.log("Bypass request failed");
                            parseError(bypassError);
                            return responseIPv4;
                        }
                    }
                    return responseIPv4;
                }
                const responseIPv6 = await fetchWithProtocol(resource, 6, options);
                if (responseIPv6) {
                    if (responseIPv6.status === 403 && options.enableBypass && options.bypassUrl) {
                        try {
                            const bypassResponse = await (0, axios_1.default)({
                                url: options.bypassUrl,
                                method: 'POST',
                                data: {
                                    url: resource,
                                    method: options.method,
                                    headers: options.headers,
                                    data: options.data,
                                    params: options.params
                                },
                                timeout: options.timeout,
                                validateStatus: () => true
                            });
                            return bypassResponse;
                        }
                        catch (bypassError) {
                            console.log("Bypass request failed");
                            parseError(bypassError);
                            return responseIPv6;
                        }
                    }
                    return responseIPv6;
                }
            }
            catch (error) {
                console.log("Error at URL : ", resource);
                const errorDetails = parseError(error);
                if (retryCount < maxRetries &&
                    error.code !== 'ERR_NETWORK' &&
                    error.code !== "ECONNABORTED" &&
                    error.code !== "ETIMEDOUT" &&
                    !errorDetails.message.toLowerCase().includes('too many requests') &&
                    !axios_1.default.isCancel(error)) {
                    console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                console.log(`All ${maxRetries + 1} retries failed for ${resource}`);
                throw error;
            }
        }
        throw new Error(`Failed to get response after ${maxRetries + 1} attempts`);
    };
    return await tryOriginalRequest();
}
exports.fetchWithTimeout = fetchWithTimeout;
const fetchWithProtocol = async (url, version, options) => {
    const source = axios_1.default.CancelToken.source();
    const id = setTimeout(() => {
        source.cancel(`Request timed out after ${options.timeout}ms`);
    }, options.timeout);
    try {
        const response = await (0, axios_1.default)({
            ...options,
            url,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            cancelToken: source.token,
            family: version
        });
        clearTimeout(id);
        return response;
    }
    catch (error) {
        clearTimeout(id);
        console.log(`Error at URL (IPv${version}): `, url);
        parseError(error);
        if (axios_1.default.isCancel(error)) {
            console.log('Request canceled:', error.message, url);
            return undefined;
        }
        throw error;
    }
};
function toBoolean(value) {
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    return value;
}
exports.toBoolean = toBoolean;
function fetchNumbersFromString(inputString) {
    const regex = /\d+/g;
    const matches = inputString.match(regex);
    if (matches) {
        const result = matches.join('');
        return result;
    }
    else {
        return '';
    }
}
exports.fetchNumbersFromString = fetchNumbersFromString;
function parseError(err, prefix = 'TgCms') {
    let status = 'UNKNOWN';
    let message = 'An unknown error occurred';
    let error = 'UnknownError';
    const extractMessage = (data) => {
        if (Array.isArray(data)) {
            const messages = data.map((item) => extractMessage(item));
            return messages.filter((message) => message !== undefined).join(', ');
        }
        else if (typeof data === 'string') {
            return data;
        }
        else if (typeof data === 'object' && data !== null) {
            let resultString = '';
            for (const key in data) {
                const value = data[key];
                if (Array.isArray(data[key]) && data[key].every(item => typeof item === 'string')) {
                    resultString = resultString + data[key].join(', ');
                }
                else {
                    const result = extractMessage(value);
                    if (result) {
                        resultString = resultString + result;
                    }
                }
            }
            return resultString;
        }
        return JSON.stringify(data);
    };
    if (err.response) {
        const response = err.response;
        status =
            response.data?.status ||
                response.status ||
                err.status ||
                'UNKNOWN';
        message =
            response.data?.message ||
                response.data?.errors ||
                response.errorMessage ||
                response.message ||
                response.statusText ||
                response.data ||
                err.message ||
                'An error occurred';
        error =
            response.data?.error ||
                response.error ||
                err.name ||
                err.code ||
                'Error';
    }
    else if (err.request) {
        status = err.status || 'NO_RESPONSE';
        message = err.data?.message ||
            err.data?.errors ||
            err.message ||
            err.statusText ||
            err.data ||
            err.message || 'The request was triggered but no response was received';
        error = err.name || err.code || 'NoResponseError';
    }
    else if (err.message) {
        status = err.status || 'UNKNOWN';
        message = err.message;
        error = err.name || err.code || 'Error';
    }
    else if (err.errorMessage) {
        status = err.status || 'UNKNOWN';
        message = err.errorMessage;
        error = err.name || err.code || 'Error';
    }
    const msg = `${prefix ? `${prefix} ::` : ""} ${extractMessage(message)} `;
    const resp = { status, message: err.errorMessage || msg, error };
    console.log(resp.error == 'RPCError' ? resp.message : resp);
    return resp;
}
exports.parseError = parseError;
let botCount = 0;
function ppplbot(chatId, botToken) {
    let token = botToken;
    if (!token) {
        if (botCount % 2 === 1) {
            token = 'bot6624618034:AAHoM3GYaw3_uRadOWYzT7c2OEp6a7A61mY';
        }
        else {
            token = 'bot6607225097:AAG6DJg9Ll5XVxy24Nr449LTZgRb5bgshUA';
        }
        botCount++;
    }
    const targetChatId = chatId || '-1001801844217';
    const apiUrl = `https://api.telegram.org/${token}/sendMessage?chat_id=${targetChatId}`;
    return apiUrl;
}
exports.ppplbot = ppplbot;
;
exports.defaultReactions = [
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
];
exports.defaultMessages = [
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15",
    "16", "17", "18", "19", "20", "21"
];
function areJsonsNotSame(json1, json2) {
    const keysToIgnore = ["id", "_id"];
    function deepCompare(obj1, obj2) {
        if (obj1 === obj2)
            return true;
        if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) {
            return false;
        }
        const keys1 = Object.keys(obj1).filter(key => !keysToIgnore.includes(key)).sort();
        const keys2 = Object.keys(obj2).filter(key => !keysToIgnore.includes(key)).sort();
        if (keys1.length !== keys2.length)
            return false;
        return keys1.every(key => deepCompare(obj1[key], obj2[key]));
    }
    return !deepCompare(json1, json2);
}
exports.areJsonsNotSame = areJsonsNotSame;
function mapToJson(map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
        obj[String(key)] = value;
    }
    return obj;
}
exports.mapToJson = mapToJson;
//# sourceMappingURL=utils.js.map
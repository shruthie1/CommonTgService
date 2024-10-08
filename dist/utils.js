"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultMessages = exports.defaultReactions = void 0;
exports.sleep = sleep;
exports.contains = contains;
exports.fetchWithTimeout = fetchWithTimeout;
exports.toBoolean = toBoolean;
exports.fetchNumbersFromString = fetchNumbersFromString;
exports.parseError = parseError;
exports.ppplbot = ppplbot;
const axios_1 = require("axios");
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function contains(str, arr) {
    return (arr.some(element => {
        if (str?.includes(element)) {
            return true;
        }
        return false;
    }));
}
;
async function fetchWithTimeout(resource, options = {}, maxRetries = 1) {
    options.timeout = options.timeout || 50000;
    options.method = options.method || 'GET';
    const fetchWithProtocol = async (url, version) => {
        const source = axios_1.default.CancelToken.source();
        const id = setTimeout(() => {
            source.cancel(`Request timed out after ${options.timeout}ms`);
        }, options.timeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                headers: { 'Content-Type': 'application/json' },
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
    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
        try {
            const responseIPv4 = await fetchWithProtocol(resource, 4);
            if (responseIPv4)
                return responseIPv4;
            const responseIPv6 = await fetchWithProtocol(resource, 6);
            if (responseIPv6)
                return responseIPv6;
        }
        catch (error) {
            console.log("Error at URL : ", resource);
            const errorDetails = parseError(error);
            if (retryCount < maxRetries && error.code !== 'ERR_NETWORK' && error.code !== "ECONNABORTED" && error.code !== "ETIMEDOUT" && !errorDetails.message.toLowerCase().includes('too many requests') && !axios_1.default.isCancel(error)) {
                console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            else {
                console.log(`All ${maxRetries + 1} retries failed for ${resource}`);
                return undefined;
            }
        }
    }
}
function toBoolean(value) {
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    return value;
}
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
    "16", "17", "18"
];
//# sourceMappingURL=utils.js.map
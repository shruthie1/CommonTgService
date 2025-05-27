"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorUtils = void 0;
exports.extractMessage = extractMessage;
exports.parseError = parseError;
exports.isAxiosError = isAxiosError;
exports.createError = createError;
const logbots_1 = require("./logbots");
const axios_1 = __importDefault(require("axios"));
const DEFAULT_ERROR_CONFIG = {
    maxMessageLength: 200,
    notificationTimeout: 10000,
    ignorePatterns: [
        /INPUT_USER_DEACTIVATED/i,
        /too many req/i,
        /could not find/i,
        /ECONNREFUSED/i
    ],
    defaultStatus: 500,
    defaultMessage: 'An unknown error occurred',
    defaultError: 'UnknownError'
};
function safeStringify(data, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
        return '[Max Depth Reached]';
    }
    try {
        if (data === null || data === undefined) {
            return String(data);
        }
        if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
            return String(data);
        }
        if (data instanceof Error) {
            return data.message || data.toString();
        }
        if (Array.isArray(data)) {
            if (data.length === 0)
                return '[]';
            return `[${data.map(item => safeStringify(item, depth + 1, maxDepth)).join(', ')}]`;
        }
        if (typeof data === 'object') {
            const entries = Object.entries(data)
                .filter(([_, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `${k}: ${safeStringify(v, depth + 1, maxDepth)}`);
            if (entries.length === 0)
                return '{}';
            return `{${entries.join(', ')}}`;
        }
        return String(data);
    }
    catch (error) {
        return `[Error Stringifying: ${error instanceof Error ? error.message : String(error)}]`;
    }
}
function extractMessage(data, path = '', depth = 0, maxDepth = 5) {
    try {
        if (depth > maxDepth) {
            return `${path}=[Max Depth Reached]`;
        }
        if (data === null || data === undefined) {
            return '';
        }
        if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
            return path ? `${path}=${data}` : String(data);
        }
        if (data instanceof Error) {
            const errorInfo = [
                data.message ? `message=${data.message}` : '',
                data.name ? `name=${data.name}` : '',
                data.stack ? `stack=${data.stack.split('\n')[0]}` : ''
            ].filter(Boolean).join('\n');
            return path ? `${path}=(${errorInfo})` : errorInfo;
        }
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return '';
            }
            return data
                .map((item, index) => extractMessage(item, path ? `${path}[${index}]` : `[${index}]`, depth + 1, maxDepth))
                .filter(Boolean)
                .join('\n');
        }
        if (typeof data === 'object') {
            const messages = [];
            for (const key of Object.keys(data)) {
                const value = data[key];
                const newPath = path ? `${path}.${key}` : key;
                const extracted = extractMessage(value, newPath, depth + 1, maxDepth);
                if (extracted) {
                    messages.push(extracted);
                }
            }
            return messages.join('\n');
        }
        return '';
    }
    catch (error) {
        console.error("Error in extractMessage:", error);
        return `Error extracting message: ${error instanceof Error ? error.message : String(error)}`;
    }
}
async function sendNotification(url, timeout = DEFAULT_ERROR_CONFIG.notificationTimeout) {
    try {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            console.error("Invalid notification URL:", url);
            return undefined;
        }
        return await axios_1.default.get(url, {
            timeout,
            validateStatus: status => status < 500
        });
    }
    catch (error) {
        console.error("Failed to send notification:", error instanceof Error ? error.message : String(error));
        return undefined;
    }
}
function shouldIgnoreError(message, status, patterns) {
    if (status === 429)
        return true;
    return patterns.some(pattern => pattern.test(message));
}
function extractStatusCode(err, defaultStatus) {
    var _a, _b, _c;
    if (!err)
        return defaultStatus;
    if (err.response) {
        const response = err.response;
        return ((_a = response.data) === null || _a === void 0 ? void 0 : _a.statusCode) ||
            ((_b = response.data) === null || _b === void 0 ? void 0 : _b.status) ||
            ((_c = response.data) === null || _c === void 0 ? void 0 : _c.ResponseCode) ||
            response.status ||
            err.status ||
            defaultStatus;
    }
    return err.statusCode || err.status || defaultStatus;
}
function extractErrorMessage(err, defaultMessage) {
    var _a, _b, _c, _d, _e, _f;
    if (!err)
        return defaultMessage;
    if ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) {
        const responseData = err.response.data;
        return responseData.message ||
            responseData.errors ||
            responseData.ErrorMessage ||
            responseData.errorMessage ||
            responseData.UserMessage ||
            (typeof responseData === 'string' ? responseData : null) ||
            err.response.statusText ||
            err.message ||
            defaultMessage;
    }
    if (err.request) {
        return ((_b = err.data) === null || _b === void 0 ? void 0 : _b.message) ||
            ((_c = err.data) === null || _c === void 0 ? void 0 : _c.errors) ||
            ((_d = err.data) === null || _d === void 0 ? void 0 : _d.ErrorMessage) ||
            ((_e = err.data) === null || _e === void 0 ? void 0 : _e.errorMessage) ||
            ((_f = err.data) === null || _f === void 0 ? void 0 : _f.UserMessage) ||
            (typeof err.data === 'string' ? err.data : null) ||
            err.message ||
            err.statusText ||
            'The request was triggered but no response was received';
    }
    return err.message || err.errorMessage || defaultMessage;
}
function extractErrorType(err, defaultError) {
    var _a, _b;
    if (!err)
        return defaultError;
    if ((_b = (_a = err.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) {
        return err.response.data.error;
    }
    return err.error || err.name || err.code || defaultError;
}
function parseError(err, prefix, sendErr = true, config = {}) {
    const fullConfig = Object.assign(Object.assign({}, DEFAULT_ERROR_CONFIG), config);
    try {
        const clientId = process.env.clientId || 'UptimeChecker2';
        const prefixStr = `${clientId}${prefix ? ` - ${prefix}` : ''}`;
        const status = extractStatusCode(err, fullConfig.defaultStatus);
        const rawMessage = extractErrorMessage(err, fullConfig.defaultMessage);
        const error = extractErrorType(err, fullConfig.defaultError);
        let extractedMessage;
        try {
            extractedMessage = typeof rawMessage === 'string' ? rawMessage : extractMessage(rawMessage);
        }
        catch (e) {
            extractedMessage = safeStringify(rawMessage) || 'Error extracting message';
        }
        const fullMessage = `${prefixStr} :: ${extractedMessage}`;
        console.log("parsedErr: ", fullMessage);
        const response = {
            status,
            message: err.errorMessage ? err.errorMessage : String(fullMessage).slice(0, fullConfig.maxMessageLength),
            error,
            raw: err
        };
        if (sendErr) {
            try {
                const ignoreError = shouldIgnoreError(fullMessage, status, fullConfig.ignorePatterns);
                if (!ignoreError) {
                    const notificationMessage = err.errorMessage ? err.errorMessage : extractedMessage;
                    const notifUrl = `${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(prefixStr)} :: ${encodeURIComponent(notificationMessage)}`;
                    sendNotification(notifUrl, fullConfig.notificationTimeout)
                        .catch(e => console.error("Failed to send error notification:", e));
                }
            }
            catch (notificationError) {
                console.error('Failed to prepare error notification:', notificationError);
            }
        }
        return response;
    }
    catch (fatalError) {
        console.error("Fatal error in parseError:", fatalError);
        return {
            status: fullConfig.defaultStatus,
            message: "Error in error handling",
            error: "FatalError",
            raw: err
        };
    }
}
function isAxiosError(error) {
    return axios_1.default.isAxiosError(error);
}
function createError(message, status = 500, errorType = 'ApplicationError') {
    return {
        status,
        message,
        error: errorType
    };
}
exports.ErrorUtils = {
    parseError,
    extractMessage,
    sendNotification,
    createError,
    isAxiosError
};
//# sourceMappingURL=parseError.js.map
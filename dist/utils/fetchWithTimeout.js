"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
const axios_1 = __importDefault(require("axios"));
const parseError_1 = require("./parseError");
const ChannelLogger_1 = require("./ChannelLogger");
const common_1 = require("./common");
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 30000,
    jitterFactor: 0.2,
};
const DEFAULT_NOTIFICATION_CONFIG = {
    enabled: true,
    channelEnvVar: 'httpFailuresChannel',
    timeout: 5000,
};
async function notifyInternal(prefix, errorDetails, config = DEFAULT_NOTIFICATION_CONFIG) {
    if (!config.enabled)
        return;
    prefix = `${prefix} ${process.env.clientId || 'uptimeChecker2'}`;
    try {
        const errorMessage = typeof errorDetails.message === 'string'
            ? errorDetails.message
            : JSON.stringify(errorDetails.message);
        const formattedMessage = errorMessage.includes('ETIMEDOUT') ? 'Connection timed out' :
            errorMessage.includes('ECONNREFUSED') ? 'Connection refused' :
                (0, parseError_1.extractMessage)(errorDetails?.message);
        console.error(`${prefix}\n${formattedMessage}`);
        if (errorDetails.status === 429)
            return;
        const notificationText = `${prefix}\n\n${formattedMessage}`;
        try {
            await ChannelLogger_1.clog.sendHttpFailures(notificationText);
        }
        catch (error) {
            (0, parseError_1.parseError)(error, "Failed to send notification:", false);
        }
    }
    catch (error) {
        (0, parseError_1.parseError)(error, "Error in notification process:", false);
    }
}
const RETRYABLE_NETWORK_ERRORS = [
    'ETIMEDOUT',
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'ERR_NETWORK',
    'ERR_BAD_RESPONSE',
    'EHOSTUNREACH',
    'ENETUNREACH'
];
const RETRYABLE_STATUS_CODES = [408, 500, 502, 503, 504];
function shouldRetry(error, parsedError) {
    if (axios_1.default.isAxiosError(error)) {
        if (error.code && RETRYABLE_NETWORK_ERRORS.includes(error.code)) {
            return true;
        }
        if (error.message?.toLowerCase().includes('timeout')) {
            return true;
        }
    }
    return RETRYABLE_STATUS_CODES.includes(parsedError.status);
}
function calculateBackoff(attempt, config = DEFAULT_RETRY_CONFIG) {
    const base = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
    const jitter = Math.random() * (base * config.jitterFactor);
    return Math.floor(base + jitter);
}
async function makeBypassRequest(url, options) {
    const bypassUrl = options.bypassUrl || process.env.bypassURL || '';
    if (!bypassUrl) {
        throw new Error('Bypass URL is not provided');
    }
    const finalBypassUrl = bypassUrl.startsWith('http') ?
        bypassUrl :
        'https://ravishing-perception-production.up.railway.app/execute-request';
    const bypassAxios = axios_1.default.create({
        responseType: options.responseType || 'json',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: options.timeout || 30000
    });
    const response = await bypassAxios.post(finalBypassUrl, {
        url,
        method: options.method,
        headers: options.headers,
        data: options.data,
        params: options.params,
        responseType: options.responseType,
        timeout: options.timeout,
        followRedirects: options.maxRedirects !== 0,
        maxRedirects: options.maxRedirects
    }, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (response && (options.responseType === 'arraybuffer' ||
        response.headers['content-type']?.includes('application/octet-stream') ||
        response.headers['content-type']?.includes('image/') ||
        response.headers['content-type']?.includes('audio/') ||
        response.headers['content-type']?.includes('video/') ||
        response.headers['content-type']?.includes('application/pdf'))) {
        response.data = Buffer.from(response.data);
    }
    return response;
}
function parseUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    try {
        const parsedUrl = new URL(url);
        return {
            host: parsedUrl.host,
            endpoint: parsedUrl.pathname + parsedUrl.search
        };
    }
    catch (error) {
        return null;
    }
}
async function fetchWithTimeout(url, options = {}, maxRetries) {
    console.log(`Fetching URL: ${url} with options:`, options);
    if (!url) {
        console.error('URL is empty');
        return undefined;
    }
    const retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        ...options.retryConfig,
        maxRetries: maxRetries !== undefined ? maxRetries : (options.retryConfig?.maxRetries || DEFAULT_RETRY_CONFIG.maxRetries)
    };
    const notificationConfig = {
        ...DEFAULT_NOTIFICATION_CONFIG,
        ...options.notificationConfig
    };
    options.timeout = options.timeout || 30000;
    options.method = options.method || "GET";
    const urlInfo = parseUrl(url);
    if (!urlInfo) {
        console.error(`Invalid URL: ${url}`);
        return undefined;
    }
    const { host, endpoint } = urlInfo;
    const clientId = process.env.clientId || 'UnknownClient';
    let lastError = null;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        const controller = new AbortController();
        const currentTimeout = options.timeout + (attempt * 5000);
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            }
            catch (abortError) {
                console.error("Error during abort:", abortError);
            }
        }, currentTimeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                signal: controller.signal,
                maxRedirects: options.maxRedirects ?? 5,
                timeout: currentTimeout,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            lastError = error instanceof Error ? error : new Error(String(error));
            let parsedError;
            try {
                parsedError = (0, parseError_1.parseError)(error, `host: ${host}\nendpoint:${endpoint}`, false);
            }
            catch (parseErrorError) {
                console.error("Error in parseError:", parseErrorError);
                parsedError = { status: 500, message: String(error), error: "ParseError" };
            }
            const message = parsedError.message;
            const isTimeout = axios_1.default.isAxiosError(error) && (error.code === "ECONNABORTED" ||
                (message && message.includes("timeout")) ||
                parsedError.status === 408);
            if (parsedError.status === 403 || parsedError.status === 495) {
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    if (bypassResponse) {
                        await notifyInternal(`Successfully Bypassed the request`, { message: `${clientId} host=${host}\nendpoint=${endpoint}` }, notificationConfig);
                        return bypassResponse;
                    }
                }
                catch (bypassError) {
                    let errorDetails;
                    try {
                        const bypassParsedError = (0, parseError_1.parseError)(bypassError, `host: ${host}\nendpoint:${endpoint}`, false);
                        errorDetails = (0, parseError_1.extractMessage)(bypassParsedError);
                    }
                    catch (extractBypassError) {
                        console.error("Error extracting bypass error message:", extractBypassError);
                        errorDetails = String(bypassError);
                    }
                    await notifyInternal(`Bypass attempt failed`, { message: `host=${host}\nendpoint=${endpoint}\n${`msg: ${errorDetails.slice(0, 150)}\nURL: ${url}`}` }, notificationConfig);
                }
            }
            else {
                if (isTimeout) {
                    await notifyInternal(`Request timeout on attempt ${attempt}`, {
                        message: `${clientId} host=${host}\nendpoint=${endpoint}\ntimeout=${options.timeout}ms`,
                        status: 408
                    }, notificationConfig);
                }
                else {
                    await notifyInternal(`Attempt ${attempt} failed`, {
                        message: `${clientId} host=${host}\nendpoint=${endpoint}\n${`mgs: ${message.slice(0, 150)}`}`,
                        status: parsedError.status
                    }, notificationConfig);
                }
            }
            if (attempt < retryConfig.maxRetries && shouldRetry(error, parsedError)) {
                const delay = calculateBackoff(attempt, retryConfig);
                console.log(`Retrying request (${attempt + 1}/${retryConfig.maxRetries}) after ${delay}ms`);
                await (0, common_1.sleep)(delay);
                continue;
            }
            if (attempt >= retryConfig.maxRetries) {
                break;
            }
        }
    }
    try {
        let errorData;
        try {
            if (lastError) {
                const parsedLastError = (0, parseError_1.parseError)(lastError, `${clientId} host: ${host}\nendpoint:${endpoint}`, false);
                errorData = (0, parseError_1.extractMessage)(parsedLastError);
            }
            else {
                errorData = 'Unknown error';
            }
        }
        catch (extractLastError) {
            console.error("Error extracting last error:", extractLastError);
            errorData = String(lastError) || 'Unknown error';
        }
        await notifyInternal(`All ${retryConfig.maxRetries} retries exhausted`, { message: `${errorData.slice(0, 150)}` }, notificationConfig);
    }
    catch (finalError) {
        console.error('Failed to send final error notification:', finalError);
    }
    return undefined;
}
//# sourceMappingURL=fetchWithTimeout.js.map
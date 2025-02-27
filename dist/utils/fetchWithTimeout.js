"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = void 0;
const axios_1 = __importDefault(require("axios"));
const Helpers_1 = require("telegram/Helpers");
const parseError_1 = require("./parseError");
const logbots_1 = require("./logbots");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
async function fetchWithTimeout(url, options = {}, maxRetries = 3) {
    if (!url) {
        console.error('URL is empty');
        return undefined;
    }
    options.timeout = options.timeout || 30000;
    options.method = options.method || "GET";
    let lastError = null;
    console.log(`Trying: ${url}`);
    const parsedUrl = new URL(url);
    const host = parsedUrl.host;
    const endpoint = parsedUrl.pathname + parsedUrl.search;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const currentTimeout = options.timeout + (attempt * 5000);
        const timeoutId = setTimeout(() => controller.abort(), currentTimeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                signal: controller.signal,
                httpAgent: new http_1.default.Agent({ keepAlive: true, timeout: currentTimeout }),
                httpsAgent: new https_1.default.Agent({ keepAlive: true, timeout: currentTimeout }),
                maxRedirects: 5,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            lastError = error;
            const parsedError = (0, parseError_1.parseError)(error, `host: ${host}\nendpoint:${endpoint}`, false);
            const message = (0, parseError_1.extractMessage)(parsedError);
            const isTimeout = axios_1.default.isAxiosError(error) &&
                (error.code === "ECONNABORTED" ||
                    error.message.includes("timeout") ||
                    parsedError.status === 408);
            if (isTimeout) {
                console.error(`Request timeout (${options.timeout}ms): ${url}`);
                notify(`Timeout on attempt ${attempt}`, {
                    message: `host=${host}\nendpoint=${endpoint}\ntimeout=${options.timeout}ms`,
                    status: 408
                });
            }
            else {
                notify(`Attempt ${attempt} failed`, {
                    message: `host=${host}\nendpoint=${endpoint}\n${message.length < 250 ? `msg: ${message}` : "msg: Message too long"}`,
                    status: parsedError.status
                });
            }
            if (parsedError.status === 403) {
                notify(`Attempting bypass for`, { message: `host=${host}\nendpoint=${endpoint}` });
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    notify(`Successfully executed 403 request`, { message: `host=${host}\nendpoint=${endpoint}` });
                    return bypassResponse;
                }
                catch (bypassError) {
                    const errorDetails = (0, parseError_1.extractMessage)((0, parseError_1.parseError)(bypassError, `host: ${host}\nendpoint:${endpoint}`, false));
                    notify(`Bypass attempt failed`, `host=${host}\nendpoint=${endpoint}\n${errorDetails.length < 250 ? `msg: ${errorDetails}` : "msg: Message too long"}`);
                    return undefined;
                }
            }
            if (attempt < maxRetries && (shouldRetry(error, parsedError) || isRetryableStatus(parsedError.status))) {
                const delay = calculateBackoff(attempt);
                console.log(`Retrying request (${attempt + 1}/${maxRetries}) after ${delay}ms`);
                await (0, Helpers_1.sleep)(delay);
                continue;
            }
            return undefined;
        }
    }
    const errorData = (0, parseError_1.extractMessage)((0, parseError_1.parseError)(lastError, `host: ${host}\nendpoint:${endpoint}`, false));
    notify(`All ${maxRetries} retries exhausted`, `${errorData.length < 250 ? `msg: ${errorData}` : "msg: Message too long"}`);
    return undefined;
}
exports.fetchWithTimeout = fetchWithTimeout;
async function makeBypassRequest(url, options) {
    if (!options.bypassUrl && !process.env.bypassURL) {
        console.error('Bypass URL is not provided');
        throw new Error('Bypass URL is not provided');
    }
    options.bypassUrl = options.bypassUrl || `${process.env.bypassURL}/execute-request`;
    return axios_1.default.post(options.bypassUrl, {
        url,
        method: options.method,
        headers: options.headers,
        data: options.data,
        params: options.params,
    });
}
function shouldRetry(error, parsedError) {
    if (axios_1.default.isAxiosError(error)) {
        const networkErrors = [
            'ETIMEDOUT',
            'ECONNABORTED',
            'ECONNREFUSED',
            'ECONNRESET',
            'ERR_NETWORK',
            'ERR_BAD_RESPONSE',
            'EHOSTUNREACH',
            'ENETUNREACH'
        ];
        if (networkErrors.includes(error.code)) {
            return true;
        }
        if (error.message?.toLowerCase().includes('timeout')) {
            return true;
        }
    }
    return isRetryableStatus(parsedError.status);
}
function notify(prefix, errorDetails) {
    const errorMessage = typeof errorDetails.message === 'string'
        ? errorDetails.message
        : JSON.stringify(errorDetails.message);
    console.error(`${prefix}\n${errorMessage.includes('ETIMEDOUT') ? 'Connection timed out' :
        errorMessage.includes('ECONNREFUSED') ? 'Connection refused' :
            (0, parseError_1.extractMessage)(errorDetails?.message)}`);
    if (errorDetails.status === 429)
        return;
    const notificationText = `${prefix}\n\n${errorMessage.includes('ETIMEDOUT') ? 'Connection timed out' :
        errorMessage.includes('ECONNREFUSED') ? 'Connection refused' :
            (0, parseError_1.extractMessage)(errorDetails?.message)}`;
    try {
        axios_1.default.get(`${(0, logbots_1.ppplbot)(process.env.httpFailuresChannel)}&text=${encodeURIComponent(notificationText)}`);
    }
    catch (error) {
        console.error("Failed to notify failure:", error);
    }
}
function isRetryableStatus(status) {
    return [408, 500, 502, 503, 504, 429].includes(status);
}
function calculateBackoff(attempt) {
    const minDelay = 500;
    const maxDelay = 30000;
    const base = Math.min(minDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * (base * 0.2);
    return Math.floor(base + jitter);
}
//# sourceMappingURL=fetchWithTimeout.js.map
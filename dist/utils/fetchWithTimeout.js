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
async function fetchWithTimeout(url, options = {}, maxRetries = 1) {
    if (!url)
        throw new Error("URL is required");
    options.timeout = options.timeout || 50000;
    options.method = options.method || "GET";
    let lastError = null;
    if (!url.includes('api.telegram.org')) {
        notify(`${process.env.clientId}`, { message: `trying: ${url}` });
    }
    else {
        console.log(`trying: ${url}`);
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (axios_1.default.isAxiosError(error) && error.code === "ECONNABORTED") {
                console.error(`Request timeout: ${url}`);
            }
            lastError = error;
            const parsedError = (0, parseError_1.parseError)(error, url, false);
            notify(`Attempt ${attempt} failed: `, { message: parsedError.status });
            if (parsedError.status === 403) {
                notify(`Attempting bypass for`, url);
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    notify(`Successfully Excuted 403 Request`, { message: (0, parseError_1.extractMessage)(bypassResponse.data) });
                    return bypassResponse;
                }
                catch (bypassError) {
                    notify(`Bypass attempt failed`, (0, parseError_1.parseError)(bypassError, url, false));
                    throw bypassError;
                }
            }
            if (attempt < maxRetries && shouldRetry(error, parsedError)) {
                const delay = Math.min(500 * (attempt + 1), 5000);
                await (0, Helpers_1.sleep)(delay);
                continue;
            }
            throw error;
        }
    }
    notify(`All ${maxRetries} retries exhausted`, (0, parseError_1.parseError)(lastError, url, false));
    throw lastError;
}
exports.fetchWithTimeout = fetchWithTimeout;
async function makeBypassRequest(url, options) {
    if (!options.bypassUrl && !process.env.bypassURL)
        throw new Error("Bypass URL is required");
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
    return (!axios_1.default.isCancel(error) &&
        !parsedError.message.toLowerCase().includes("too many requests") &&
        ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK"].includes(error.code));
}
function notify(prefix, errorDetails) {
    console.log(prefix, errorDetails.message);
    if (errorDetails.status === 429)
        return;
    try {
        axios_1.default.get(`${(0, logbots_1.ppplbot)(process.env.httpFailuresChannel)}&text=${encodeURIComponent(`${prefix}\n\n${(0, parseError_1.extractMessage)(errorDetails?.message)}`)}`);
    }
    catch (error) {
        console.error("Failed to notify failure:", error);
    }
}
//# sourceMappingURL=fetchWithTimeout.js.map
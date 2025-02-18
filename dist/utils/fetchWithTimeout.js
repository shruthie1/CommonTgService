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
const dns_1 = __importDefault(require("dns"));
const util_1 = require("util");
const lookupAsync = (0, util_1.promisify)(dns_1.default.lookup);
async function fetchWithTimeout(url, options = {}, maxRetries = 1) {
    if (!url)
        throw new Error("URL is required");
    options.timeout = options.timeout || 50000;
    options.method = options.method || "GET";
    let lastError = null;
    let resolvedUrl = url;
    const useIPv6 = options.useIPv6 ?? process.env.USE_IPV6 === "true";
    try {
        const { address } = await lookupAsync(new URL(url).hostname, { family: useIPv6 ? 6 : 4 });
        resolvedUrl = url.replace(new URL(url).hostname, address);
    }
    catch (dnsError) {
        console.error("DNS resolution failed, falling back to default URL:", dnsError);
    }
    if (!url.includes('api.telegram.org')) {
        notifyFailure(`trying: ${resolvedUrl}`, { message: "fetching" });
    }
    else {
        console.log(`trying: ${resolvedUrl}`);
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);
        try {
            const response = await (0, axios_1.default)({
                ...options,
                url: resolvedUrl,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            console.error("Error:", error);
            clearTimeout(timeoutId);
            lastError = error;
            const parsedError = (0, parseError_1.parseError)(error, resolvedUrl, false);
            notifyFailure(`Attempt ${attempt + 1} failed`, parsedError);
            if (axios_1.default.isAxiosError(error) && error.response?.status === 403 && options.bypassUrl) {
                notifyFailure(`403 error encountered. Attempting bypass`, parsedError);
                try {
                    const bypassResponse = await makeBypassRequest(resolvedUrl, options);
                    notifyFailure(`Successfully bypassed 403 error`, { message: bypassResponse.data });
                    return bypassResponse;
                }
                catch (bypassError) {
                    notifyFailure(`Bypass attempt failed`, (0, parseError_1.parseError)(bypassError, resolvedUrl, false));
                    throw bypassError;
                }
            }
            if (!useIPv6 && shouldRetry(error, parsedError) && attempt === 0) {
                console.warn("Retrying with IPv6...");
                return fetchWithTimeout(url, { ...options, useIPv6: true }, maxRetries - attempt);
            }
            if (attempt < maxRetries - 1 && shouldRetry(error, parsedError)) {
                const delay = Math.min(500 * (attempt + 1), 5000);
                await (0, Helpers_1.sleep)(delay);
                continue;
            }
            throw error;
        }
    }
    notifyFailure(`All retries exhausted`, (0, parseError_1.parseError)(lastError, resolvedUrl, false));
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
function notifyFailure(message, errorDetails) {
    console.log(message, errorDetails);
    try {
        axios_1.default.get(`${(0, logbots_1.ppplbot)(process.env.httpFailuresChannel)}&text=${encodeURIComponent(`Request failed:\n${errorDetails?.message}\n\nmsg: ${message}`)}`);
    }
    catch (error) {
        console.error("Failed to notify failure:", error);
    }
}
//# sourceMappingURL=fetchWithTimeout.js.map
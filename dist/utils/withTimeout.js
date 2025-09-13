"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = withTimeout;
const Helpers_1 = require("telegram/Helpers");
async function withTimeout(promiseFactory, options = {}) {
    const { timeout = 60000, errorMessage = "Operation timeout", throwErr = true, maxRetries = 1, baseDelay = 500, maxDelay = 5000, shouldRetry = defaultShouldRetry, cancelSignal, onTimeout, } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (cancelSignal?.aborted) {
            lastError = new Error("Operation cancelled");
            break;
        }
        try {
            const task = promiseFactory();
            return await runWithTimeout(task, timeout, cancelSignal, errorMessage);
        }
        catch (err) {
            lastError = err;
            if (!shouldRetry(err, attempt) || attempt === maxRetries)
                break;
            const delay = Math.min(baseDelay * 2 ** (attempt - 1) * (1 + Math.random() * 0.1), maxDelay);
            await (0, Helpers_1.sleep)(delay);
        }
    }
    if (onTimeout) {
        try {
            await onTimeout(lastError, maxRetries);
        }
        catch (cbErr) {
            console.error("onTimeout callback failed:", cbErr);
        }
    }
    return throwErr ? Promise.reject(lastError) : undefined;
}
async function runWithTimeout(promise, timeoutMs, cancelSignal, errorMessage) {
    let timeoutId = null;
    let abortListener = null;
    try {
        return await new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`${errorMessage ?? "Timeout"} after ${timeoutMs}ms`));
            }, timeoutMs);
            if (cancelSignal) {
                if (cancelSignal.aborted) {
                    reject(new Error("Operation cancelled"));
                    return;
                }
                abortListener = () => reject(new Error("Operation cancelled"));
                cancelSignal.addEventListener("abort", abortListener, { once: true });
            }
            promise.then(resolve).catch(reject);
        });
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (abortListener && cancelSignal) {
            cancelSignal.removeEventListener("abort", abortListener);
            abortListener = null;
        }
    }
}
function defaultShouldRetry(error, attempt) {
    if (attempt >= 3)
        return false;
    if (error?.message?.toLowerCase().includes("cancelled"))
        return false;
    const msg = (error?.message || "").toLowerCase();
    const code = error?.code;
    return (msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("connection") ||
        code === "ECONNRESET" ||
        code === "ENOTFOUND" ||
        code === "ETIMEDOUT");
}
//# sourceMappingURL=withTimeout.js.map
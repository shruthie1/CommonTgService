import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { sleep } from "telegram/Helpers";
import { extractMessage, parseError } from "./parseError";
import { ppplbot } from "./logbots";
import http from 'http';
import https from 'https';

export async function fetchWithTimeout(
    url: string,
    options: AxiosRequestConfig & { bypassUrl?: string } = {},
    maxRetries = 3  // Increased default retries
): Promise<AxiosResponse | undefined> {
    if (!url) return undefined;

    options.timeout = options.timeout || 30000; // Set default timeout to 30 seconds
    options.method = options.method || "GET";
    let lastError: Error | null = null;

    console.log(`trying: ${url}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        // Don't multiply timeout linearly, use a more conservative increase
        const currentTimeout = options.timeout + (attempt * 5000); // Add 5 seconds per retry
        const timeoutId = setTimeout(() => controller.abort(), currentTimeout);

        try {
            // Try axios first
            try {
                const response = await axios({
                    ...options,
                    url,
                    signal: controller.signal,
                    httpAgent: new http.Agent({ keepAlive: true, timeout: currentTimeout }),
                    httpsAgent: new https.Agent({ keepAlive: true, timeout: currentTimeout }),
                    maxRedirects: 5,
                });
                clearTimeout(timeoutId);
                return response;
            } catch (axiosError) {
                // Fallback to fetch API if axios fails
                if (shouldTryFetchFallback(axiosError)) {
                    const fetchResponse = await makeFetchRequest(url, options, controller.signal);
                    clearTimeout(timeoutId);
                    return fetchResponse;
                }
                throw axiosError; // Re-throw if we shouldn't use fetch fallback
            }
        } catch (error) {
            clearTimeout(timeoutId);
            lastError = error;
            const parsedError = parseError(error, url, false);
            const parsedUrl = new URL(url);
            const host = parsedUrl.host;
            const endpoint = parsedUrl.pathname + parsedUrl.search;

            const message = extractMessage(parsedError);
            const isTimeout = axios.isAxiosError(error) &&
                (error.code === "ECONNABORTED" ||
                    error.message.includes("timeout") ||
                    parsedError.status === 408);

            if (isTimeout) {
                console.error(`Request timeout (${options.timeout}ms): ${url}`);
                notify(`Timeout on attempt ${attempt}`, {
                    message: `host=${host}\nendpoint=${endpoint}\ntimeout=${options.timeout}ms`,
                    status: 408
                });
            } else {
                notify(`Attempt ${attempt} failed`, {
                    message: `host=${host}\nendpoint=${endpoint}\n${message.length < 250 ? `msg: ${message}` : "msg: Message too long"}`,
                    status: parsedError.status
                });
            }

            // Handle 403 errors with bypass
            if (parsedError.status === 403) {
                notify(`Attempting bypass for`, { message: `host=${host}\nendpoint=${endpoint}` });
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    notify(`Successfully Excuted 403 Request`, { message: `host=${host}\nendpoint=${endpoint}` });
                    return bypassResponse;
                } catch (bypassError) {
                    const errorDetails = extractMessage(parseError(bypassError, url, false));
                    notify(`Bypass attempt failed`, `host=${host}\nendpoint=${endpoint}\n${errorDetails.length < 250 ? `msg: ${errorDetails}` : "msg: Message too long"}`);
                    return undefined;
                }
            }

            // Enhanced retry condition
            if (attempt < maxRetries && (shouldRetry(error, parsedError) || isRetryableStatus(parsedError.status))) {
                const delay = calculateBackoff(attempt);
                console.log(`Retrying request (${attempt + 1}/${maxRetries}) after ${delay}ms`);
                await sleep(delay);
                continue;
            }
            return undefined;
        }
    }
    const errorData = extractMessage(parseError(lastError, url, false))
    notify(`All ${maxRetries} retries exhausted`, `${errorData.length < 250 ? `msg: ${errorData}` : "msg: Message too long"}`);
    return undefined;
}

async function makeBypassRequest(url: string, options: AxiosRequestConfig & { bypassUrl?: string }): Promise<AxiosResponse | undefined> {
    if (!options.bypassUrl && !process.env.bypassURL) return undefined;
    options.bypassUrl = options.bypassUrl || `${process.env.bypassURL}/execute-request`;
    return axios.post(options.bypassUrl, {
        url,
        method: options.method,
        headers: options.headers,
        data: options.data,
        params: options.params,
    });
}

function shouldRetry(error: any, parsedError: any): boolean {
    // Network-level errors
    if (axios.isAxiosError(error)) {
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

    // HTTP status-based retries
    return isRetryableStatus(parsedError.status);
}

function notify(prefix: string, errorDetails: any) {
    const errorMessage = typeof errorDetails.message === 'string'
        ? errorDetails.message
        : JSON.stringify(errorDetails.message);

    console.log(prefix, errorDetails);

    if (errorDetails.status === 429) return;

    const notificationText = `${prefix}\n\n${errorMessage.includes('ETIMEDOUT') ? 'Connection timed out' :
            errorMessage.includes('ECONNREFUSED') ? 'Connection refused' :
                extractMessage(errorDetails?.message)
        }`;

    try {
        axios.get(`${ppplbot(process.env.httpFailuresChannel)}&text=${encodeURIComponent(notificationText)}`);
    } catch (error) {
        console.error("Failed to notify failure:", error);
    }
}

// Add new helper functions
function isRetryableStatus(status: number): boolean {
    return [408, 500, 502, 503, 504, 429].includes(status);
}

function calculateBackoff(attempt: number): number {
    // Exponential backoff with a lower initial wait time for network issues
    const minDelay = 500; // Start with 500ms
    const maxDelay = 30000; // Cap at 30 seconds
    const base = Math.min(minDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * (base * 0.2); // Add up to 20% jitter
    return Math.floor(base + jitter);
}

function shouldTryFetchFallback(error: any): boolean {
    return axios.isAxiosError(error) &&
        ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK", "ECONNREFUSED"].includes(error.code);
}

async function makeFetchRequest(url: string, options: AxiosRequestConfig, signal: AbortSignal): Promise<AxiosResponse> {
    const fetchOptions: RequestInit = {
        method: options.method,
        headers: options.headers as HeadersInit,
        body: options.data ? JSON.stringify(options.data) : undefined,
        signal,
        // Add keep-alive and better connection handling
        keepalive: true,
        credentials: 'same-origin'
    };

    const response = await fetch(url, fetchOptions);
    let data;
    try {
        data = await response.json();
    } catch (e) {
        // Handle non-JSON responses
        data = await response.text();
    }

    return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        config: options,
    } as AxiosResponse;
}

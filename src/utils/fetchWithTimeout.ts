import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { sleep } from "telegram/Helpers";
import { parseError } from "./parseError";
import { ppplbot } from "./logbots";

export async function fetchWithTimeout(
    url: string,
    options: AxiosRequestConfig & { bypassUrl?: string } = {},
    maxRetries = 1
): Promise<AxiosResponse> {
    if (!url) throw new Error("URL is required");

    options.timeout = options.timeout || 50000;
    options.method = options.method || "GET";
    options.bypassUrl = options.bypassUrl

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios({ ...options, url });
            return response; // Success
        } catch (error) {
            lastError = error;
            const parsedError = parseError(error, url, false);
            notifyFailure(`Attempt ${attempt + 1} failed`, parsedError);
            // Handle 403 errors with bypass
            if (axios.isAxiosError(error) && error.response && error.response.status === 403 && options.bypassUrl) {
                notifyFailure(`403 error encountered. Attempting bypass`, parsedError);
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    notifyFailure(`Successfully bypassed 403 error`, { message: bypassResponse.data });
                    return bypassResponse;
                } catch (bypassError) {
                    notifyFailure(`Bypass attempt failed`, parseError(bypassError, url, false));
                    throw bypassError;
                }
            }

            // Check if we should retry
            if (attempt < maxRetries - 1 && shouldRetry(error, parsedError)) {
                const delay = Math.min(500 * (attempt + 1), 5000); // Exponential backoff (max 5s)
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    notifyFailure(`All retries exhausted`, parseError(lastError, url, false));
    throw lastError;
}

async function makeBypassRequest(url: string, options: AxiosRequestConfig & { bypassUrl?: string }) {
    if (!options.bypassUrl && !process.env.bypassURL) throw new Error("Bypass URL is required");
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
    return (
        !axios.isCancel(error) &&
        !parsedError.message.toLowerCase().includes("too many requests") &&
        ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK"].includes(error.code)
    );
}

function notifyFailure(message: string, errorDetails: any) {
    try {
        axios.get(`${ppplbot(process.env.httpFailuresChannel)}&text=${encodeURIComponent(`Request failed:\n${errorDetails?.message}\n\nmsg: ${message}`)}`);
    } catch (error) {
        console.error("Failed to notify failure:", error);
    }
}

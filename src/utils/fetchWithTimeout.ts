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

    let lastError: Error | null = null;
    if (!url.includes('api.telegram.org')) {
        notify(`trying`, { message: url });
    } else {
        console.log(`trying: ${url}`);
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout);
        try {
            const response = await axios({
                ...options,
                url,
                signal: controller.signal, // Attach the AbortController signal
            });
            clearTimeout(timeoutId);
            return response; // Success
        } catch (error) {
            clearTimeout(timeoutId);
            if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
                console.error(`Request timeout: ${url}`);
            }
            lastError = error;
            const parsedError = parseError(error, url, false);
            notify(`Attempt ${attempt} failed`, parsedError);

            // Handle 403 errors with bypass
            if (parsedError.status === 403 && options.bypassUrl) {
                notify(`403 error encountered. Attempting bypass`, parsedError);
                try {
                    const bypassResponse = await makeBypassRequest(url, options);
                    notify(`Successfully bypassed 403 error`, { message: bypassResponse.data });
                    return bypassResponse;
                } catch (bypassError) {
                    notify(`Bypass attempt failed`, parseError(bypassError, url, false));
                    throw bypassError;
                }
            }

            // Check if we should retry
            if (attempt < maxRetries && shouldRetry(error, parsedError)) {
                const delay = Math.min(500 * (attempt + 1), 5000); // Exponential backoff (max 5s)
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    notify(`All ${maxRetries} retries exhausted`, parseError(lastError, url, false));
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

function notify(prefix: string, errorDetails: any) {
    console.log(prefix, errorDetails);
    if(errorDetails.status === 429) return;
    try {
        axios.get(`${ppplbot(process.env.httpFailuresChannel)}&text=${encodeURIComponent(`${prefix}\n\n${errorDetails?.message}`)}`);
    } catch (error) {
        console.error("Failed to notify failure:", error);
    }
}

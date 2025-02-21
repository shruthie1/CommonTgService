import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { sleep } from "telegram/Helpers";
import { extractMessage, parseError } from "./parseError";
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

    // const parsedUrl = new URL(url);
    // const host = parsedUrl.host;
    // const endpoint = parsedUrl.pathname + parsedUrl.search;

    // if (!url.includes('api.telegram.org') && !url.includes('/receive')) {
    //     notify(`${process.env.clientId}`, { message: `trying:\nhost=${host}\nendpoint=${endpoint}` });
    // } else {
    //     console.log(`trying: ${url}`);
    // }

    console.log(`trying: ${url}`);

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
            const parsedUrl = new URL(url);
            const host = parsedUrl.host;
            const endpoint = parsedUrl.pathname + parsedUrl.search;

            const message = extractMessage(parsedError);
            notify(`Attempt ${attempt} failed: `, { message: `host=${host}\nendpoint=${endpoint}\n${message.length < 250 ? `msg: ${message}` : "msg: Message too long"}` });

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
    const errorData = extractMessage(parseError(lastError, url, false))
    notify(`All ${maxRetries} retries exhausted`, `${errorData.length < 250 ? `msg: ${errorData}` : "msg: Message too long"}`);
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
    console.log(prefix, errorDetails.message);
    if (errorDetails.status === 429) return;
    try {
        axios.get(`${ppplbot(process.env.httpFailuresChannel)}&text=${encodeURIComponent(`${prefix}\n\n${extractMessage(errorDetails?.message)}`)}`);
    } catch (error) {
        console.error("Failed to notify failure:", error);
    }
}

import axios, { AddressFamily, AxiosRequestConfig, AxiosResponse } from 'axios';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function contains(str: string | null | undefined, arr: string[]): boolean {
  if (!str || !Array.isArray(arr)) return false;
  return arr.some(element => element && str.includes(element));
}

export async function fetchWithTimeout(
    url: string,
    options: AxiosRequestConfig & { bypassUrl?: string } = {},
    sendErr = true,
    maxRetries = 1
): Promise<AxiosResponse> {
    if (!url) throw new Error("URL is required");

    options.timeout = options.timeout || 50000;
    options.method = options.method || "GET";

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios({ ...options, url });

            // Handle 403 errors with bypass
            if (response.status === 403 && options.bypassUrl) {
                return await makeBypassRequest(url, options);
            }

            return response; // Success
        } catch (error) {
            lastError = error;
            console.log("Error at URL : ", url);
            const parsedError = parseError(error, url);

            // Check if we should retry
            if (attempt < maxRetries - 1 && shouldRetry(error, parsedError)) {
                const delay = Math.min(500 * (attempt + 1), 5000); // Exponential backoff (max 5s)
                console.log(`Retrying ${url} (Attempt ${attempt + 2}/${maxRetries}) after ${delay}ms...`);
                await sleep(delay);
                continue;
            }

            // Log failure if all retries fail
            if (sendErr) {
                notifyFailure(url, parsedError);
            }
            throw error;
        }
    }
    throw lastError;
}

async function makeBypassRequest(url: string, options: AxiosRequestConfig & { bypassUrl?: string }) {
    if (!options.bypassUrl) throw new Error("Bypass URL is required");

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

function notifyFailure(url: string, errorDetails: any) {
    axios.get(`${ppplbot()}&text=${encodeURIComponent(`${process.env.clientId} - Request failed: ${url}\n${errorDetails.message}`)}`);
}

export function toBoolean(value: string | number | boolean | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase().trim();
    return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value;
}

export function fetchNumbersFromString(inputString: string | null | undefined): string {
  if (!inputString) return '';
  const regex = /\d+/g;
  const matches = inputString.match(regex);
  return matches ? matches.join('') : '';
}

interface ErrorResponse {
  status: string;
  message: string;
  error: string;
}

interface ExtendedError extends Error {
  response?: {
    data?: any;
    status?: string | number;
    statusText?: string;
    errorMessage?: string;
    message?: string;
    error?: string;
  };
  request?: any;
  status?: string;
  errorMessage?: string;
  code?: string;
  data?: any;
  statusText?: string;
}

export function parseError(
  err: ExtendedError,
  prefix = 'TgCms',
): ErrorResponse {
  let status = 'UNKNOWN';
  let message = 'An unknown error occurred';
  let error = 'UnknownError';

  const extractMessage = (data: any): string => {
    if (!data) return '';
    
    if (Array.isArray(data)) {
      return data
        .map((item) => extractMessage(item))
        .filter(Boolean)
        .join(', ');
    }
    
    if (typeof data === 'string') {
      return data;
    }
    
    if (typeof data === 'object') {
      return Object.values(data)
        .map(value => extractMessage(value))
        .filter(Boolean)
        .join(', ') || JSON.stringify(data);
    }
    
    return String(data);
  };

  if (err.response) {
    const response = err.response;
    status = String(
      response.data?.status ||
      response.status ||
      err.status ||
      'UNKNOWN'
    );
    
    message = extractMessage(
      response.data?.message ||
      response.data?.errors ||
      response.errorMessage ||
      response.message ||
      response.statusText ||
      response.data ||
      err.message
    ) || 'An error occurred';
    
    error = String(
      response.data?.error ||
      response.error ||
      err.name ||
      err.code ||
      'Error'
    );
  } else if (err.request) {
    status = String(err.status || 'NO_RESPONSE');
    message = extractMessage(
      err.data?.message ||
      err.data?.errors ||
      err.message ||
      err.statusText ||
      err.data
    ) || 'The request was triggered but no response was received';
    error = String(err.name || err.code || 'NoResponseError');
  } else {
    status = String(err.status || 'UNKNOWN');
    message = err.message || err.errorMessage || 'Unknown error occurred';
    error = String(err.name || err.code || 'Error');
  }

  const formattedMessage = `${prefix ? `${prefix} :: ` : ''}${message}`;
  const response: ErrorResponse = { 
    status, 
    message: err.errorMessage || formattedMessage, 
    error 
  };

  console.log(response.error === 'RPCError' ? response.message : response);
  return response;
}

// Bot token management
const BOT_TOKENS = Object.freeze([
  'bot6624618034:AAHoM3GYaw3_uRadOWYzT7c2OEp6a7A61mY',
  'bot6607225097:AAG6DJg9Ll5XVxy24Nr449LTZgRb5bgshUA'
] as const);

let botCount = 0;

export function ppplbot(chatId?: string, botToken?: string): string {
  // Reset counter if it gets too large to prevent potential overflow
  if (botCount > 1000000) botCount = 0;
  
  const token = botToken || BOT_TOKENS[botCount++ % BOT_TOKENS.length];
  
  if (!botToken && !token.match(/^bot\d+:[A-Za-z0-9_-]+$/)) {
    throw new Error('Invalid bot token format');
  }

  const targetChatId = chatId?.trim() || '-1001801844217';
  if (!targetChatId.match(/^-?\d+$/)) {
    throw new Error('Invalid chat ID format');
  }
  
  try {
    const url = new URL(`https://api.telegram.org/${token}/sendMessage`);
    url.searchParams.set('chat_id', targetChatId);
    return url.toString();
  } catch (error) {
    throw new Error('Failed to construct Telegram API URL');
  }
}

export const defaultReactions = Object.freeze([
  '❤', '🔥', '👏', '🥰', '😁', '🤔',
  '🤯', '😱', '🤬', '😢', '🎉', '🤩',
  '🤮', '💩', '🙏', '👌', '🕊', '🤡',
  '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
  '🤣', '💔', '🏆', '😭', '😴', '👍',
  '🌚', '⚡', '🍌', '😐', '💋', '👻',
  '👀', '🙈', '🤝', '🤗', '🆒',
  '🗿', '🙉', '🙊', '🤷', '👎'
] as const);

export const defaultMessages = Object.freeze([
  "1", "2", "3", "4", "5", "6", "7", "8",
  "9", "10", "11", "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "21"
] as const);

export function areJsonsNotSame(json1: unknown, json2: unknown): boolean {
  const keysToIgnore = ['id', '_id'];
  console.log('[areJsonsNotSame] Starting comparison...');

  function normalizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeObject);

    const normalized: Record<string, unknown> = {};
    const sortedKeys = Object.keys(obj as Record<string, unknown>)
      .filter(key => !keysToIgnore.includes(key))
      .sort();

    for (const key of sortedKeys) {
      normalized[key] = normalizeObject((obj as Record<string, unknown>)[key]);
    }
    return normalized;
  }
  const normalized1 = normalizeObject(json1);
  const normalized2 = normalizeObject(json2);
  const result = JSON.stringify(normalized1) !== JSON.stringify(normalized2);
  console.log(`[areJsonsNotSame] Comparison result: ${result ? 'Objects are different' : 'Objects are same'}`);
  
  return result;
}

export function mapToJson<K extends string | number | symbol, V>(map: Map<K, V>): Record<string, V> {
  if (!(map instanceof Map)) {
    throw new Error('Input must be a Map instance');
  }
  const obj: Record<string, V> = {};
  for (const [key, value] of map.entries()) {
    obj[String(key)] = value;
  }
  return obj;
}

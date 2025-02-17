import axios, { AddressFamily, AxiosRequestConfig, AxiosResponse } from 'axios';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function contains(str: string | null | undefined, arr: string[]): boolean {
  if (!str || !Array.isArray(arr)) return false;
  return arr.some(element => element && str.includes(element));
}

// Request queue to prevent too many concurrent requests
const requestQueue = new Map<string, Promise<unknown>>();
const MAX_CONCURRENT_REQUESTS = 10;

export async function fetchWithTimeout(
  resource: string, 
  options: AxiosRequestConfig & { 
    bypassUrl?: string; 
    enableBypass?: boolean;
    queueKey?: string; // Add ability to group requests by key
  } = {}, 
  maxRetries = 1
): Promise<AxiosResponse> {
  if (!resource) throw new Error('Resource URL is required');
  
  const queueKey = options.queueKey || resource;
  
  // Queue management
  while (requestQueue.size >= MAX_CONCURRENT_REQUESTS) {
    await Promise.race(requestQueue.values());
  }

  const requestPromise = (async () => {
    try {
      options.timeout = options.timeout || 50000;
      options.method = options.method || 'GET';
      options.enableBypass = options.enableBypass ?? true;
      options.bypassUrl = options.bypassUrl || process.env.bypassURL;

      const tryOriginalRequest = async (): Promise<AxiosResponse> => {
        let lastError: Error | null = null;

        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
          try {
            // Try IPv4 first
            const responseIPv4 = await fetchWithProtocol(resource, 4, options);
            if (responseIPv4) {
              if (responseIPv4.status === 403 && options.enableBypass && options.bypassUrl) {
                try {
                  return await makeBypassRequest(resource, options);
                } catch (bypassError) {
                  console.log("Bypass request failed");
                  parseError(bypassError);
                  return responseIPv4;
                }
              }
              return responseIPv4;
            }

            // Try IPv6 if IPv4 fails
            const responseIPv6 = await fetchWithProtocol(resource, 6, options);
            if (responseIPv6) {
              if (responseIPv6.status === 403 && options.enableBypass && options.bypassUrl) {
                try {
                  return await makeBypassRequest(resource, options);
                } catch (bypassError) {
                  console.log("Bypass request failed");
                  parseError(bypassError);
                  return responseIPv6;
                }
              }
              return responseIPv6;
            }
          } catch (error) {
            console.log("Error at URL : ", resource);
            const errorDetails = parseError(error);
            lastError = error;

            const shouldRetry = 
              retryCount < maxRetries && 
              error.code !== 'ERR_NETWORK' && 
              error.code !== "ECONNABORTED" && 
              error.code !== "ETIMEDOUT" && 
              !errorDetails.message.toLowerCase().includes('too many requests') && 
              !axios.isCancel(error);

            if (shouldRetry) {
              const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
              console.log(`Retrying... (${retryCount + 1}/${maxRetries}) after ${backoffTime}ms`);
              await sleep(backoffTime);
              continue;
            }
            
            console.log(`All ${maxRetries + 1} retries failed for ${resource}`);
            throw error;
          }
        }
        throw lastError || new Error(`Failed to get response after ${maxRetries + 1} attempts`);
      };

      return await tryOriginalRequest();
    } finally {
      requestQueue.delete(queueKey);
    }
  })();

  requestQueue.set(queueKey, requestPromise);
  return requestPromise as Promise<AxiosResponse>;
}

async function makeBypassRequest(resource: string, options: AxiosRequestConfig & { bypassUrl?: string }): Promise<AxiosResponse> {
  if (!options.bypassUrl) throw new Error('Bypass URL is required');
  
  return await axios({
    url: options.bypassUrl,
    method: 'POST',
    data: {
      url: resource,
      method: options.method,
      headers: options.headers,
      data: options.data,
      params: options.params
    },
    timeout: options.timeout,
    validateStatus: () => true
  });
}

const fetchWithProtocol = async (url: string, version: AddressFamily, options: AxiosRequestConfig): Promise<AxiosResponse | undefined> => {
  const source = axios.CancelToken.source();
  const timeoutId = setTimeout(() => {
    source.cancel(`Request timed out after ${options.timeout}ms`);
  }, options.timeout);

  try {
    const response = await axios({
      ...options,
      url,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cancelToken: source.token,
      family: version,
      validateStatus: (status) => status >= 200 && status < 600 // Allow handling of all status codes
    });
    return response;
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log('Request canceled:', error.message, url);
      return undefined;
    }
    console.log(`Error at URL (IPv${version}): `, url);
    parseError(error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

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

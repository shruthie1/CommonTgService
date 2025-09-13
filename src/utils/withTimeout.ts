import { sleep } from "telegram/Helpers";

type ShouldRetry = (error: any, attempt: number) => boolean;

interface WithTimeoutOptions {
  timeout?: number; // per-attempt timeout
  errorMessage?: string;
  throwErr?: boolean;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: ShouldRetry;
  cancelSignal?: AbortSignal;
  onTimeout?: (error: any, attempts: number) => Promise<void>;
}

export async function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  options: WithTimeoutOptions = {}
): Promise<T> {
  const {
    timeout = 60000,
    errorMessage = "Operation timeout",
    throwErr = true,
    maxRetries = 1,
    baseDelay = 500,
    maxDelay = 5000,
    shouldRetry = defaultShouldRetry,
    cancelSignal,
    onTimeout,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (cancelSignal?.aborted) {
      lastError = new Error("Operation cancelled");
      break;
    }

    try {
      const task = promiseFactory();
      return await runWithTimeout(task, timeout, cancelSignal, errorMessage);
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err, attempt) || attempt === maxRetries) break;

      const delay = Math.min(
        baseDelay * 2 ** (attempt - 1) * (1 + Math.random() * 0.1),
        maxDelay
      );
      await sleep(delay);
    }
  }

  if (onTimeout) {
    try {
      await onTimeout(lastError, maxRetries);
    } catch (cbErr) {
      console.error("onTimeout callback failed:", cbErr);
    }
  }

  return throwErr ? Promise.reject(lastError) : undefined;
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  cancelSignal?: AbortSignal,
  errorMessage?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  let abortListener: (() => void) | null = null;

  try {
    return await new Promise<T>((resolve, reject) => {
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
  } finally {
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

function defaultShouldRetry(error: any, attempt: number): boolean {
  if (attempt >= 3) return false;
  if (error?.message?.toLowerCase().includes("cancelled")) return false;
  const msg = (error?.message || "").toLowerCase();
  const code = error?.code;
  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("connection") ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT"
  );
}

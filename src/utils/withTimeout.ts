import { sleep } from "telegram/Helpers";

type ShouldRetry = (error: any, attempt: number) => boolean;

interface WithTimeoutOptions {
  timeout?: number; // per-attempt timeout
  timeLimit?: number; // total allowed time
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
    timeout = 10000,
    timeLimit = 30000,
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
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check if we've exceeded the total time limit
    if (Date.now() - startTime > timeLimit) {
      lastError = new Error(`${errorMessage}: exceeded total time limit ${timeLimit}ms`);
      break;
    }

    if (cancelSignal?.aborted) {
      lastError = new Error("Operation cancelled");
      break;
    }

    try {
      const remainingTime = Math.min(timeout, timeLimit - (Date.now() - startTime));
      const task = promiseFactory();
      return await runWithTimeout(task, remainingTime, cancelSignal, errorMessage);
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
      // Set up timeout
      timeoutId = setTimeout(() => {
        reject(new Error(`${errorMessage ?? "Timeout"} after ${timeoutMs}ms`));
      }, timeoutMs);

      // Set up cancel signal listener
      if (cancelSignal) {
        if (cancelSignal.aborted) {
          reject(new Error("Operation cancelled"));
          return;
        }
        abortListener = () => reject(new Error("Operation cancelled"));
        cancelSignal.addEventListener("abort", abortListener, { once: true });
      }

      // Handle promise resolution/rejection
      promise
        .then(resolve)
        .catch(reject);
    });
  } finally {
    // Clean up timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Clean up abort listener
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

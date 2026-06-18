export interface RetryEvent {
  attempt: number;
  attempts: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (event: RetryEvent) => void | Promise<void>;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
  retryCount: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 500);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? 5_000);
  const factor = Math.max(1, options.factor ?? 2);
  const shouldRetry = options.shouldRetry ?? (() => true);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return {
        value: await operation(attempt),
        attempts: attempt,
        retryCount: attempt - 1,
      };
    } catch (error) {
      const hasAttemptRemaining = attempt < attempts;
      if (!hasAttemptRemaining || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delayMs = Math.min(
        maxDelayMs,
        initialDelayMs * Math.pow(factor, attempt - 1),
      );

      await options.onRetry?.({
        attempt,
        attempts,
        delayMs,
        error,
      });

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  throw new Error("Retry loop exhausted unexpectedly");
}

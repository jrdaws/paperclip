export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterMs?: number;
  isRetriable?: (error: unknown) => boolean;
  onRetry?: (input: { error: unknown; attempt: number; nextDelayMs: number }) => void | Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const factor = options.factor ?? 2;
  const jitterMs = options.jitterMs ?? 75;

  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      const retriable = options.isRetriable ? options.isRetriable(error) : true;
      if (!retriable || attempt >= retries) {
        throw error;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt));
      const jitter = Math.floor(Math.random() * jitterMs);
      const nextDelayMs = exp + jitter;
      if (options.onRetry) {
        await options.onRetry({ error, attempt, nextDelayMs });
      }
      await delay(nextDelayMs);
      attempt += 1;
    }
  }
}

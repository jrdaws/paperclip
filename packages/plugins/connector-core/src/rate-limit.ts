export interface RateLimiter {
  take: (tokens?: number) => boolean;
  remaining: () => number;
}

export function createTokenBucketRateLimiter(options: {
  capacity: number;
  refillPerSecond: number;
}): RateLimiter {
  let tokens = options.capacity;
  let lastRefill = Date.now();

  function refill() {
    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - lastRefill) / 1000);
    if (elapsedSeconds <= 0) return;
    tokens = Math.min(options.capacity, tokens + elapsedSeconds * options.refillPerSecond);
    lastRefill = now;
  }

  return {
    take(nextTokens = 1) {
      refill();
      if (tokens < nextTokens) return false;
      tokens -= nextTokens;
      return true;
    },
    remaining() {
      refill();
      return Math.floor(tokens);
    },
  };
}

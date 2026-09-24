export class IdleTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "IdleTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type IdleTimeoutOptions = {
  suspension?: {
    readonly active: boolean;
    subscribe(listener: () => void): () => void;
  };
  timeoutMs: number;
  message: string;
  subscribe: (onActivity: () => void) => () => void;
  onTimeout: (error: IdleTimeoutError) => Promise<void>;
};

export const withIdleTimeout = async <T>(
  operation: () => Promise<T>,
  { timeoutMs, message, subscribe, onTimeout, suspension }: IdleTimeoutOptions,
): Promise<T> => {
  let active = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeSuspension: (() => void) | undefined;
  let rejectTimeout: (error: IdleTimeoutError) => void = () => undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const clearActivityTracking = () => {
    active = false;
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    unsubscribeSuspension?.();
    unsubscribeSuspension = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
  };
  const refreshTimeout = () => {
    if (!active) {
      return;
    }
    if (timeout) {
      clearTimeout(timeout);
    }
    if (suspension?.active) return;
    timeout = setTimeout(() => {
      active = false;
      rejectTimeout(new IdleTimeoutError(message, timeoutMs));
    }, timeoutMs);
  };

  unsubscribeSuspension = suspension?.subscribe(refreshTimeout);
  unsubscribe = subscribe(refreshTimeout);
  refreshTimeout();

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error: unknown) {
    if (error instanceof IdleTimeoutError) {
      clearActivityTracking();
      await onTimeout(error);
    }
    throw error;
  } finally {
    clearActivityTracking();
  }
};

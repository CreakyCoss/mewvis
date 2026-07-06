export const messageFromError = (error: unknown) => (error instanceof Error ? error.message : String(error));

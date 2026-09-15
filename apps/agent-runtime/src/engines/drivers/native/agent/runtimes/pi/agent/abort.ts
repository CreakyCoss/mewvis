const ABORT_MESSAGE = "Agent session 已中止";

const errorDetails = (error: unknown) =>
  error && typeof error === "object" ? (error as Readonly<{ name?: unknown; message?: unknown }>) : null;

export const isPiAbortError = (error: unknown) => {
  const details = errorDetails(error);
  if (details?.name === "AbortError") return true;
  return (
    typeof details?.message === "string" &&
    (details.message === "Unhandled stop reason: abort" || details.message === "Provider finish_reason: abort")
  );
};

export const normalizePiAbortError = (error: unknown) => {
  if (!isPiAbortError(error)) return error;
  const normalized = new Error(ABORT_MESSAGE);
  normalized.name = "AbortError";
  return normalized;
};

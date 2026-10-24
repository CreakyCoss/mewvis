import type { ChatMediaArtifact, ChatMediaResult } from "@mewvis/chat-contracts";

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 2000) : undefined);
const purpose = (value: unknown): ChatMediaResult["purpose"] =>
  value === "image-generation" || value === "image-editing" || value === "video-generation" || value === "speech"
    ? value
    : undefined;

export function startMediaResult(args: unknown): ChatMediaResult | undefined {
  const input = object(args);
  return input?.action === "generate" ? { status: "running", purpose: purpose(input.purpose), outputs: [] } : undefined;
}

/** Extract structured results before the diagnostic text is truncated. Never retain file data or preview URLs. */
export function readMediaResult(value: unknown, previous?: ChatMediaResult): ChatMediaResult | undefined {
  const envelope = object(value);
  const result = object(envelope?.details) ?? envelope;
  if (!result || !Array.isArray(result.outputs)) return undefined;
  const status =
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "stopped" ||
    result.status === "needs_input"
      ? result.status
      : typeof result.stage === "string"
        ? "running"
        : undefined;
  if (!status) return undefined;
  const outputs = result.outputs.flatMap((value): ChatMediaArtifact[] => {
    const item = object(value);
    if (
      !item ||
      (item.type !== "image" && item.type !== "video" && item.type !== "audio") ||
      typeof item.filePath !== "string" ||
      item.filePath.length > 4096 ||
      !/^(\/|[a-z]:[\\/]|\\\\)/i.test(item.filePath) ||
      /[\0\r\n]/.test(item.filePath) ||
      item.filePath.split(/[\\/]/).includes("..")
    )
      return [];
    return [
      {
        type: item.type,
        filePath: item.filePath,
        ...(typeof item.mimeType === "string" ? { mimeType: item.mimeType.slice(0, 255) } : {}),
        ...(typeof item.size === "number" && Number.isFinite(item.size) && item.size >= 0 ? { size: item.size } : {}),
      },
    ];
  });
  return {
    status,
    purpose: purpose(result.purpose) ?? previous?.purpose,
    message: text(result.message),
    error: text(result.error),
    outputs: [
      ...new Map([...(previous?.outputs ?? []), ...outputs].map((output) => [output.filePath, output])).values(),
    ],
  };
}

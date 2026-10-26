import type {
  KnowledgeErrorCode,
  KnowledgeErrorInfo,
  KnowledgeMetadata,
} from "./contracts.js";

export class KnowledgeError extends Error implements KnowledgeErrorInfo {
  readonly code: KnowledgeErrorCode;
  readonly retryAfterMs?: number;
  readonly details?: KnowledgeMetadata;
  readonly requestId?: string;

  constructor(
    info: KnowledgeErrorInfo,
    options?: { cause?: unknown; requestId?: string },
  ) {
    super(info.message, options);
    this.name = "KnowledgeError";
    this.code = info.code;
    if (info.retryAfterMs !== undefined) this.retryAfterMs = info.retryAfterMs;
    if (info.details !== undefined) this.details = info.details;
    if (options?.requestId !== undefined) this.requestId = options.requestId;
  }
}

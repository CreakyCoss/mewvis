/** Knowledge wire protocol, independent of databases, providers, UI and the host. */
export const KNOWLEDGE_PROTOCOL_VERSION = 1 as const;

export type KnowledgeJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly KnowledgeJsonValue[]
  | { readonly [key: string]: KnowledgeJsonValue };
export type KnowledgeMetadata = Readonly<Record<string, KnowledgeJsonValue>>;
export type KnowledgeScalar = null | boolean | number | string;
/** RFC 3339 UTC timestamp, e.g. 2026-10-26T00:00:00.000Z. */
export type KnowledgeTimestamp = string;

export const KNOWLEDGE_ERROR_CODES = [
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONFLICT",
  "NOT_SUPPORTED",
  "NOT_READY",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "TIMEOUT",
  "ABORTED",
  "INTERNAL_ERROR",
  "INVALID_RESPONSE",
  "TRANSPORT_ERROR",
] as const;
export type KnowledgeErrorCode = (typeof KNOWLEDGE_ERROR_CODES)[number];
export interface KnowledgeErrorInfo {
  readonly code: KnowledgeErrorCode;
  /** Safe, actionable text; never include credentials, raw SQL or upstream bodies. */
  readonly message: string;
  readonly retryAfterMs?: number;
  readonly details?: KnowledgeMetadata;
}

export type KnowledgeSearchMode = "auto" | "keyword" | "vector" | "hybrid";
export type KnowledgeFilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notIn"
  | "exists"
  | "and"
  | "or"
  | "not";
/** Filters address document metadata only. Adapters must reject unsupported filters. */
export type KnowledgeFilter =
  | {
      readonly operator: "eq" | "ne";
      readonly field: string;
      readonly value: KnowledgeScalar;
    }
  | {
      readonly operator: "gt" | "gte" | "lt" | "lte";
      readonly field: string;
      readonly value: number | string;
    }
  | {
      readonly operator: "in" | "notIn";
      readonly field: string;
      readonly values: readonly KnowledgeScalar[];
    }
  | {
      readonly operator: "exists";
      readonly field: string;
      readonly exists: boolean;
    }
  | {
      readonly operator: "and" | "or";
      readonly conditions: readonly KnowledgeFilter[];
    }
  | { readonly operator: "not"; readonly condition: KnowledgeFilter };

export interface KnowledgePageInput {
  readonly cursor?: string;
  readonly limit?: number;
}
/** Cursors are opaque and bound to the same operation, base and filters. */
export interface KnowledgePage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface KnowledgeCapabilities {
  /** Advisory only: the host/service still authorizes every request. */
  /** Unknown additive method names may be advertised by newer v1 servers. */
  readonly methods: readonly string[];
  readonly searchModes: readonly Exclude<KnowledgeSearchMode, "auto">[];
  readonly filterOperators: readonly KnowledgeFilterOperator[];
  readonly idempotency: boolean;
  readonly limits?: {
    readonly maxSearchResults?: number;
    readonly maxPageSize?: number;
    readonly maxImportDocuments?: number;
    readonly maxDocumentCharacters?: number;
    readonly maxAttachmentBytes?: number;
  };
}
export interface KnowledgeServiceDescription {
  readonly protocolVersion: typeof KNOWLEDGE_PROTOCOL_VERSION;
  /** Identity of this logical service/data space, persistent across restarts. */
  readonly serviceId: string;
  readonly backend: {
    readonly kind: "sqlite" | "mongodb" | "remote";
    readonly provider: string;
  };
  readonly capabilities: KnowledgeCapabilities;
}
export interface KnowledgeProbeResult {
  readonly status: "ready" | "degraded" | "unavailable";
  readonly checkedAt: KnowledgeTimestamp;
  readonly checks: readonly {
    readonly name: string;
    readonly status: "ok" | "warning" | "error";
    readonly message?: string;
  }[];
}

export type KnowledgeBaseState =
  "empty" | "indexing" | "ready" | "degraded" | "unavailable";
export interface KnowledgeBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly state: KnowledgeBaseState;
  readonly metadata?: KnowledgeMetadata;
  readonly documentCount?: number;
  readonly chunkCount?: number;
  readonly createdAt?: KnowledgeTimestamp;
  readonly updatedAt?: KnowledgeTimestamp;
  /** A base can be read-only even when another base in the same service is writable. */
  readonly capabilities: KnowledgeCapabilities;
}
export interface KnowledgeBaseCreateInput {
  readonly name: string;
  readonly description?: string;
  readonly metadata?: KnowledgeMetadata;
}
export interface KnowledgeBaseUpdateInput {
  readonly knowledgeBaseId: string;
  /** Omitted fields are unchanged; supplied metadata replaces the whole metadata object. */
  readonly patch: {
    readonly name?: string;
    readonly description?: string;
    readonly metadata?: KnowledgeMetadata;
  };
}

export interface KnowledgeSource {
  /** Opaque provenance only: the SDK never reads files or fetches this URI. */
  readonly uri?: string;
  readonly mediaType?: string;
  /** Managed original in the same knowledge base; independent of the provenance URI. */
  readonly attachmentId?: string;
}

/** Original-file metadata only; never contains a local path, bucket, object key or durable storage credential. */
export interface KnowledgeAttachment {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  /** Lowercase hex SHA-256 of the complete original. A ready attachment has been verified by the service. */
  readonly sha256: string;
  /** Pending uploads cannot be used by documents or downloaded. */
  readonly state: "pending" | "ready";
  readonly createdAt: KnowledgeTimestamp;
  readonly updatedAt: KnowledgeTimestamp;
}
export interface KnowledgeAttachmentReference {
  readonly knowledgeBaseId: string;
  readonly attachmentId: string;
}
/** Trusted byte channel; separate from the JSON business transport. */
export interface KnowledgeAttachmentByteGateway {
  upload(
    token: string,
    body: AsyncIterable<Uint8Array>,
    context?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  download(
    token: string,
    context?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly body: AsyncIterable<Uint8Array>;
    readonly fileName: string;
    readonly mediaType: string;
    readonly sizeBytes: number;
  }>;
}
/** Short-lived, scoped transfer authority. Treat URLs, headers and tokens as secrets; do not persist or log them. */
export type KnowledgeAttachmentTransfer<
  M extends "GET" | "PUT" = "GET" | "PUT",
> =
  | {
      readonly kind: "http";
      readonly url: string;
      readonly method: M;
      readonly headers?: Readonly<Record<string, string>>;
      readonly expiresAt: KnowledgeTimestamp;
    }
  | {
      /** The caller's authenticated binary bridge handles this opaque token; it is never a filesystem path. */
      readonly kind: "host";
      readonly token: string;
      readonly expiresAt: KnowledgeTimestamp;
    };
export interface KnowledgeAttachmentCreateUploadInput {
  readonly knowledgeBaseId: string;
  /** Basename only, with no path separators or control characters. */
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}
export interface KnowledgeAttachmentUpload {
  readonly attachment: KnowledgeAttachment;
  /** Transfer bytes outside JSON RPC, then call completeUpload. The SDK never follows the target automatically. */
  readonly transfer: KnowledgeAttachmentTransfer<"PUT">;
}
export interface KnowledgeAttachmentDownload extends KnowledgeAttachmentReference {
  readonly transfer: KnowledgeAttachmentTransfer<"GET">;
}
export interface KnowledgeAttachmentDeletion extends KnowledgeAttachmentReference {
  readonly deleted: true;
}
export interface KnowledgeAttachmentAbort extends KnowledgeAttachmentReference {
  readonly aborted: true;
}
/** Character offsets are zero-based, half-open Unicode code-point offsets. Lines/pages are one-based. */
export interface KnowledgeLocation {
  readonly page?: number;
  readonly section?: readonly string[];
  readonly lines?: { readonly start: number; readonly end: number };
  readonly characters?: { readonly start: number; readonly end: number };
}
export interface KnowledgeTextLocation {
  readonly start: number;
  readonly end: number;
  readonly location: KnowledgeLocation;
}
/** v1 accepts already extracted plain text. File parsing and binary upload belong to ingestion adapters. */
export interface KnowledgeTextDocument {
  /** Stable caller ID, unique within one base; required for skip/replace duplicate policies. */
  readonly externalId?: string;
  readonly title: string;
  readonly text: string;
  readonly source?: KnowledgeSource;
  readonly metadata?: KnowledgeMetadata;
  /** Optional mapping from normalized text ranges back to original pages/sections. */
  readonly locations?: readonly KnowledgeTextLocation[];
}
export interface KnowledgeDocumentSummary {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly externalId?: string;
  readonly title: string;
  readonly state: "pending" | "indexing" | "ready" | "failed";
  readonly revision?: string;
  readonly source?: KnowledgeSource;
  readonly metadata?: KnowledgeMetadata;
  readonly chunkCount?: number;
  readonly createdAt?: KnowledgeTimestamp;
  readonly updatedAt?: KnowledgeTimestamp;
  readonly error?: KnowledgeErrorInfo;
}
export interface KnowledgeDocument extends KnowledgeDocumentSummary {
  readonly text: string;
  readonly locations?: readonly KnowledgeTextLocation[];
}
export interface KnowledgeImportInput {
  readonly knowledgeBaseId: string;
  readonly documents: readonly KnowledgeTextDocument[];
  readonly duplicatePolicy?: "reject" | "skip" | "replace";
}
export interface KnowledgeChunk {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly documentId: string;
  readonly documentRevision?: string;
  readonly ordinal: number;
  readonly text: string;
  readonly title: string;
  readonly source?: KnowledgeSource;
  readonly location?: KnowledgeLocation;
  readonly metadata?: KnowledgeMetadata;
}

export interface KnowledgeSearchInput {
  /** Explicit, nonempty scope. Omission/[] never means "all knowledge bases". */
  readonly knowledgeBaseIds: readonly string[];
  readonly query: string;
  readonly limit?: number;
  readonly mode?: KnowledgeSearchMode;
  readonly filter?: KnowledgeFilter;
  /** Default false: failure of any requested base fails the search. */
  readonly allowPartial?: boolean;
}
export interface KnowledgeScore {
  readonly value: number;
  readonly kind: "similarity" | "distance" | "relevance" | "rank";
  readonly higherIsBetter: boolean;
}
export interface KnowledgeSearchHit {
  /** Opaque evidence identity, unique within a result; not a fetchable chunk ID. */
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly documentId?: string;
  readonly documentRevision?: string;
  readonly chunkId?: string;
  readonly title: string;
  readonly text: string;
  readonly source?: KnowledgeSource;
  readonly location?: KnowledgeLocation;
  readonly metadata?: KnowledgeMetadata;
  /** Backend-specific score, never a confidence probability or cross-provider ranking key. */
  readonly score?: KnowledgeScore;
}
export interface KnowledgeSearchTarget {
  readonly knowledgeBaseId: string;
  readonly status: "ok" | "error";
  readonly indexRevision?: string;
  readonly error?: KnowledgeErrorInfo;
}
export interface KnowledgeSearchResult {
  /** Final relevance order is authoritative. Preserve this order when building model context. */
  readonly hits: readonly KnowledgeSearchHit[];
  readonly diagnostics: {
    readonly status: "complete" | "partial";
    readonly elapsedMs: number;
    /** Exactly one entry for every requested base, including bases with no hits. */
    readonly targets: readonly KnowledgeSearchTarget[];
    readonly warnings: readonly {
      readonly code: string;
      readonly message: string;
      readonly knowledgeBaseId?: string;
    }[];
  };
}

export type KnowledgeJobState =
  | "queued"
  | "running"
  | "cancelling"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "cancelled";
export interface KnowledgeJob {
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly kind: "import" | "delete-documents" | "delete-base" | "reindex";
  readonly state: KnowledgeJobState;
  readonly progress: {
    readonly total: number | null;
    /** Includes successful, failed and skipped items. */
    readonly processed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly createdAt: KnowledgeTimestamp;
  readonly updatedAt: KnowledgeTimestamp;
  readonly error?: KnowledgeErrorInfo;
  readonly result?: {
    readonly documents: readonly {
      readonly documentId?: string;
      readonly externalId?: string;
      readonly status: "succeeded" | "skipped" | "failed";
      readonly error?: KnowledgeErrorInfo;
    }[];
  };
}

export interface KnowledgeMethodMap {
  "service.describe": {
    input: Record<string, never>;
    output: KnowledgeServiceDescription;
  };
  "service.probe": {
    input: Record<string, never>;
    output: KnowledgeProbeResult;
  };
  "bases.list": {
    input: KnowledgePageInput;
    output: KnowledgePage<KnowledgeBase>;
  };
  "bases.get": {
    input: { readonly knowledgeBaseId: string };
    output: KnowledgeBase;
  };
  "bases.create": { input: KnowledgeBaseCreateInput; output: KnowledgeBase };
  "bases.update": { input: KnowledgeBaseUpdateInput; output: KnowledgeBase };
  "bases.delete": {
    input: { readonly knowledgeBaseId: string };
    output: KnowledgeJob;
  };
  "bases.reindex": {
    input: { readonly knowledgeBaseId: string };
    output: KnowledgeJob;
  };
  "documents.list": {
    input: KnowledgePageInput & { readonly knowledgeBaseId: string };
    output: KnowledgePage<KnowledgeDocumentSummary>;
  };
  "documents.get": {
    input: { readonly knowledgeBaseId: string; readonly documentId: string };
    output: KnowledgeDocument;
  };
  "documents.import": { input: KnowledgeImportInput; output: KnowledgeJob };
  "documents.delete": {
    input: {
      readonly knowledgeBaseId: string;
      readonly documentIds: readonly string[];
    };
    output: KnowledgeJob;
  };
  "documents.reindex": {
    input: {
      readonly knowledgeBaseId: string;
      readonly documentIds: readonly string[];
    };
    output: KnowledgeJob;
  };
  "attachments.list": {
    input: KnowledgePageInput & { readonly knowledgeBaseId: string };
    output: KnowledgePage<KnowledgeAttachment>;
  };
  "attachments.get": {
    input: KnowledgeAttachmentReference;
    output: KnowledgeAttachment;
  };
  "attachments.createUpload": {
    input: KnowledgeAttachmentCreateUploadInput;
    output: KnowledgeAttachmentUpload;
  };
  "attachments.completeUpload": {
    input: KnowledgeAttachmentReference;
    output: KnowledgeAttachment;
  };
  "attachments.abortUpload": {
    input: KnowledgeAttachmentReference;
    output: KnowledgeAttachmentAbort;
  };
  "attachments.createDownload": {
    input: KnowledgeAttachmentReference;
    output: KnowledgeAttachmentDownload;
  };
  "attachments.delete": {
    input: KnowledgeAttachmentReference;
    output: KnowledgeAttachmentDeletion;
  };
  "chunks.list": {
    input: KnowledgePageInput & {
      readonly knowledgeBaseId: string;
      readonly documentId: string;
    };
    output: KnowledgePage<KnowledgeChunk>;
  };
  "chunks.get": {
    input: {
      readonly knowledgeBaseId: string;
      readonly documentId: string;
      readonly chunkId: string;
    };
    output: KnowledgeChunk;
  };
  search: { input: KnowledgeSearchInput; output: KnowledgeSearchResult };
  "jobs.list": {
    input: KnowledgePageInput & { readonly knowledgeBaseId: string };
    output: KnowledgePage<KnowledgeJob>;
  };
  "jobs.get": {
    input: { readonly knowledgeBaseId: string; readonly jobId: string };
    output: KnowledgeJob;
  };
  "jobs.cancel": {
    input: { readonly knowledgeBaseId: string; readonly jobId: string };
    output: KnowledgeJob;
  };
}
export type KnowledgeMethod = keyof KnowledgeMethodMap;
export type KnowledgeInput<M extends KnowledgeMethod> =
  KnowledgeMethodMap[M]["input"];
export type KnowledgeOutput<M extends KnowledgeMethod> =
  KnowledgeMethodMap[M]["output"];
export type KnowledgeMutationMethod =
  | "bases.create"
  | "bases.update"
  | "bases.delete"
  | "bases.reindex"
  | "documents.import"
  | "documents.delete"
  | "documents.reindex"
  | "attachments.createUpload"
  | "attachments.completeUpload"
  | "attachments.abortUpload"
  | "attachments.delete"
  | "jobs.cancel";
/** No application identity, database connection, credentials or host paths in business requests. */
export type KnowledgeRequest<M extends KnowledgeMethod = KnowledgeMethod> = {
  [K in M]: {
    readonly version: typeof KNOWLEDGE_PROTOCOL_VERSION;
    readonly method: K;
    readonly params: KnowledgeInput<K>;
  } & (K extends KnowledgeMutationMethod
    ? { readonly idempotencyKey?: string }
    : { readonly idempotencyKey?: never });
}[M];
export type KnowledgeResponse<M extends KnowledgeMethod = KnowledgeMethod> =
  | {
      readonly version: typeof KNOWLEDGE_PROTOCOL_VERSION;
      readonly ok: true;
      readonly value: KnowledgeOutput<M>;
      readonly requestId?: string;
    }
  | {
      readonly version: typeof KNOWLEDGE_PROTOCOL_VERSION;
      readonly ok: false;
      readonly error: KnowledgeErrorInfo;
      readonly requestId?: string;
    };

export interface KnowledgeRequestOptions {
  /** Stops waiting/transport work. It does not roll back a mutation or cancel a server job. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export interface KnowledgeMutationOptions extends KnowledgeRequestOptions {
  /** Service must advertise support. Same key + same request returns the original operation. */
  readonly idempotencyKey?: string;
}
export interface KnowledgeTransport {
  readonly version: typeof KNOWLEDGE_PROTOCOL_VERSION;
  request(
    request: KnowledgeRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<KnowledgeResponse>;
}
export type KnowledgeCall<M extends KnowledgeMethod> = (
  input: KnowledgeInput<M>,
  options?: M extends KnowledgeMutationMethod
    ? KnowledgeMutationOptions
    : KnowledgeRequestOptions,
) => Promise<KnowledgeOutput<M>>;

/** Consumer-facing capability definitions live in the package entry point. */
export type { KnowledgeClient } from "./index.js";

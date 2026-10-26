/**
 * 原始附件存储的服务端适配契约。
 *
 * 调用方选择本地目录、OSS/S3 或其他存储，并按此接口实现适配器。
 * 服务管理附件 ID、权限、文档引用和生命周期；适配器只处理服务生成的对象 Key 与字节。
 * 本入口定义接口，不打开目录、连接云服务或注册上传下载路由。
 */
import type {
  KnowledgeAttachmentTransfer,
  KnowledgeProbeResult,
} from "@mewvis/knowledge-sdk";
import type { KnowledgeAttachmentStorageConfiguration } from "@mewvis/knowledge-sdk/configuration";

export interface KnowledgeAttachmentStorageContext {
  readonly signal?: AbortSignal;
}

export interface KnowledgeAttachmentObjectInfo {
  readonly sizeBytes: number;
  /** Only report a checksum verified against stored bytes. User-supplied object metadata is insufficient. */
  readonly sha256?: string;
  /** Opaque provider revision. An ETag must never be treated as a SHA-256 checksum. */
  readonly etag?: string;
}

export interface KnowledgeAttachmentWrite {
  /** Service-generated key within this storageId. Never an untrusted filename, path or source URI. */
  readonly key: string;
  readonly body: AsyncIterable<Uint8Array>;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface KnowledgeAttachmentObject extends KnowledgeAttachmentObjectInfo {
  /** Streaming bytes; aborting the context must release the underlying read. */
  readonly body: AsyncIterable<Uint8Array>;
}

export interface KnowledgeAttachmentTransferInput {
  readonly key: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  /** Upper bound on the authority lifetime; adapters may issue a shorter grant. */
  readonly expiresAt: string;
}

/** Optional direct transfer signing. A local store can instead use a separately configured host binary bridge. */
export interface KnowledgeAttachmentTransferProvider {
  /** Must target a staging key, never the immutable object of a ready original. */
  createUpload(
    input: KnowledgeAttachmentTransferInput,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeAttachmentTransfer<"PUT">>;
  createDownload(
    input: KnowledgeAttachmentTransferInput,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeAttachmentTransfer<"GET">>;
}

/** Unified original-byte storage, independent of SQLite/MongoDB and the SDK business transport. */
export interface KnowledgeAttachmentStorage {
  /** Must equal configuration.storageId. Persist this binding with attachment metadata. */
  readonly storageId: string;
  readonly transfers?: KnowledgeAttachmentTransferProvider;
  probe(
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeProbeResult>;
  /** Missing objects return null. Keys and provider diagnostics must not escape into business responses. */
  stat(
    key: string,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeAttachmentObjectInfo | null>;
  /**
   * Stream, check size/SHA-256, then atomically publish an immutable object.
   * An existing key with identical bytes is an idempotent success; different bytes are CONFLICT.
   * Failed/aborted writes must not expose partial originals. Clean up staging objects on failure.
   */
  put(
    input: KnowledgeAttachmentWrite,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeAttachmentObjectInfo & { readonly sha256: string }>;
  /** Missing objects reject with NOT_FOUND. Do not follow a caller-provided source URI. */
  get(
    key: string,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<KnowledgeAttachmentObject>;
  /** Idempotent deletion; a missing object is success. Reference checks and retryable cleanup belong to the service. */
  delete(
    key: string,
    context?: KnowledgeAttachmentStorageContext,
  ): Promise<void>;
  /** Release this adapter instance's handles; never delete its data or other callers' resources. */
  close(): Promise<void>;
}

export interface KnowledgeAttachmentStorageFactoryContext extends KnowledgeAttachmentStorageContext {
  /** Caller-owned credential resolution; resolved values never enter persisted configuration or public DTOs. */
  readonly resolveCredential?: (reference: string) => string | Promise<string>;
  readonly fetch?: typeof globalThis.fetch;
}

/** Runtime integration contract: dispatch by kind/provider and reject unregistered providers with NOT_SUPPORTED. */
export type KnowledgeAttachmentStorageFactory = (
  configuration: KnowledgeAttachmentStorageConfiguration,
  context: KnowledgeAttachmentStorageFactoryContext,
) => Promise<KnowledgeAttachmentStorage>;

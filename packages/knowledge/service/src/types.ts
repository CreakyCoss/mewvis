import type {
  KnowledgeClient,
  KnowledgeMethod,
  KnowledgeTextDocument,
  KnowledgeTransport,
  KnowledgeAttachmentByteGateway,
} from "@mewvis/knowledge-sdk";

export interface KnowledgeEmbeddingProvider {
  /** Stable identity of the vector space, including model revision and input formatting, excluding credentials. */
  readonly signature: string;
  readonly dimensions?: number;
  embed(
    documents: readonly { readonly title: string; readonly text: string }[],
    context: {
      readonly purpose: "document" | "query";
      readonly signal: AbortSignal;
    },
  ): Promise<readonly (readonly number[])[]>;
}
export interface KnowledgeServiceOptions {
  /** Trusted injection for tests or additional models. Mutually exclusive with configuration.embedding. */
  readonly embedding?: KnowledgeEmbeddingProvider;
  readonly resolveCredential?: (reference: string) => string | Promise<string>;
  readonly fetch?: typeof globalThis.fetch;
  readonly chunking?: {
    readonly maxCharacters?: number;
    readonly overlapCharacters?: number;
  };
  readonly limits?: {
    readonly maxImportDocuments?: number;
    readonly maxDocumentCharacters?: number;
    readonly maxChunksPerBase?: number;
    readonly maxVectorSearchChunks?: number;
    readonly maxVectorSearchBytes?: number;
  };
  readonly attachments?: {
    readonly maxBytes?: number;
    readonly uploadExpiryMs?: number;
    readonly unreferencedRetentionMs?: number;
  };
}
/** Created by the trusted host, never decoded from business request params. */
export interface KnowledgeAccess {
  readonly subjectId: string;
  /** Omit for trusted access to all bases; [] grants no bases. */
  readonly knowledgeBaseIds?: readonly string[];
  readonly methods?: readonly KnowledgeMethod[];
}
export interface KnowledgeService extends KnowledgeClient {
  readonly transport: KnowledgeTransport;
  createTransport(access: KnowledgeAccess): KnowledgeTransport;
  createAttachmentGateway(
    access: KnowledgeAccess,
  ): KnowledgeAttachmentByteGateway;
  /** Stops the worker, requeues interrupted work, and releases caller-owned database resources. */
  close(): Promise<void>;
}
export interface ServiceLimits {
  maxImportDocuments: number;
  maxDocumentCharacters: number;
  maxChunksPerBase: number;
  maxVectorSearchChunks: number;
  maxVectorSearchBytes: number;
}
export interface PendingJob {
  operation: "import" | "delete-documents" | "delete-base" | "reindex";
  embeddingSignature: string | null;
  documents?: readonly KnowledgeTextDocument[];
  documentIds?: readonly string[];
  duplicatePolicy?: "reject" | "skip" | "replace";
  all?: boolean;
}

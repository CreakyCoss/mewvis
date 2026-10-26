import {
  createKnowledgeClient,
  type KnowledgeClient,
  type KnowledgeTransport,
  type KnowledgeRequest,
  type KnowledgeSearchResult,
  type KnowledgeJob,
  type KnowledgeAttachment,
  type KnowledgeAttachmentUpload,
} from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import {
  parseKnowledgeServiceConfiguration,
  type KnowledgeServiceConfiguration,
} from "@mewvis/knowledge-sdk/configuration";
import type {
  KnowledgeClient as ContractKnowledgeClient,
  KnowledgeFilter,
} from "@mewvis/knowledge-sdk/contracts";

const transport: KnowledgeTransport = {
  version: 1,
  request: async () => ({
    version: 1,
    ok: false,
    error: { code: "NOT_SUPPORTED", message: "test transport" },
  }),
};
const client: KnowledgeClient = createKnowledgeClient(transport);
const contractClient: ContractKnowledgeClient = client;
const entryClient: KnowledgeClient = contractClient;
void entryClient;
const filter: KnowledgeFilter = {
  operator: "and",
  conditions: [
    { field: "topic", operator: "eq", value: "novel" },
    { field: "year", operator: "gte", value: 2026 },
  ],
};
const result: Promise<KnowledgeSearchResult> = client.search(
  { knowledgeBaseIds: ["base-a"], query: "question", filter },
  { signal: new AbortController().signal, timeoutMs: 1000 },
);
const job: Promise<KnowledgeJob> = client.documents.import(
  {
    knowledgeBaseId: "base-a",
    documents: [{ externalId: "note", title: "Note", text: "plain text" }],
    duplicatePolicy: "replace",
  },
  { idempotencyKey: "import-note-1" },
);
void result;
void job;
void client.service.describe();
void client.bases.list();
void createKnowledgeClient(
  createKnowledgeHttpTransport({ endpoint: "https://example.test/rpc" }),
);
const configuration: KnowledgeServiceConfiguration = {
  backend: { kind: "sqlite", directory: "/caller/owned/data" },
};
void parseKnowledgeServiceConfiguration(configuration);
const upload: Promise<KnowledgeAttachmentUpload> =
  client.attachments.createUpload(
    {
      knowledgeBaseId: "base-a",
      fileName: "manual.pdf",
      mediaType: "application/pdf",
      sizeBytes: 128,
      sha256: "a".repeat(64),
    },
    { idempotencyKey: "original-1" },
  );
const original: Promise<KnowledgeAttachment> =
  client.attachments.completeUpload({
    knowledgeBaseId: "base-a",
    attachmentId: "original-1",
  });
void upload;
void original;
void client.documents.import({
  knowledgeBaseId: "base-a",
  documents: [
    {
      title: "manual",
      text: "extracted text",
      source: { attachmentId: "original-1" },
    },
  ],
});
void parseKnowledgeServiceConfiguration({
  backend: { kind: "sqlite", directory: "/caller/metadata" },
  attachmentStorage: {
    kind: "object-storage",
    storageId: "originals-v1",
    provider: "aliyun-oss",
    bucket: "originals",
    credentialRef: "oss-secret",
  },
} satisfies KnowledgeServiceConfiguration);
// @ts-expect-error Original lookup is scoped to a knowledge base.
void client.attachments.get({ attachmentId: "original-1" });
void client.attachments.createUpload({
  knowledgeBaseId: "base-a",
  fileName: "manual.pdf",
  mediaType: "application/pdf",
  sizeBytes: 128,
  sha256: "a".repeat(64),
  // @ts-expect-error Object-store routing is chosen by the host, not a business request.
  bucket: "another-bucket",
});
void client.attachments.createDownload(
  { knowledgeBaseId: "base-a", attachmentId: "original-1" },
  // @ts-expect-error A download grant is a read, not an idempotent mutation.
  { idempotencyKey: "not-a-mutation" },
);
// @ts-expect-error A delegated knowledge service owns its original-file storage.
const invalidOriginals: KnowledgeServiceConfiguration = {
  backend: {
    kind: "remote",
    provider: "mewvis-v1",
    endpoint: "https://knowledge.example",
  },
  attachmentStorage: {
    kind: "local",
    storageId: "originals-v1",
    directory: "/caller/originals",
  },
};
void invalidOriginals;
function hostDispatch(request: KnowledgeRequest) {
  if (request.method === "search") {
    const query: string = request.params.query;
    const ids: readonly string[] = request.params.knowledgeBaseIds;
    void query;
    void ids;
    // @ts-expect-error No identity or storage selection in a business request.
    void request.params.applicationId;
  }
  if (request.method === "documents.import") {
    const text: string | undefined = request.params.documents[0]?.text;
    const key: string | undefined = request.idempotencyKey;
    void text;
    void key;
  }
}
void hostDispatch;
// @ts-expect-error Search scope must be explicit.
void client.search({ query: "question" });
void client.search({
  knowledgeBaseIds: ["a"],
  query: "question",
  // @ts-expect-error Consumers cannot choose the authenticated application.
  applicationId: "other",
});
void client.search({
  knowledgeBaseIds: ["a"],
  query: "question",
  // @ts-expect-error Backend credentials belong to host configuration.
  apiKey: "secret",
});
void client.documents.import({
  knowledgeBaseId: "a",
  // @ts-expect-error Import accepts extracted text rather than filesystem paths.
  documents: [{ title: "file", path: "/secret" }],
});
// @ts-expect-error Job lookup is scoped to a knowledge base.
void client.jobs.get({ jobId: "j" });
void client.jobs.cancel({
  knowledgeBaseId: "a",
  // @ts-expect-error Cancellation of a request is distinct from a server-side job ID.
  signal: new AbortController().signal,
});
void client.search(
  { knowledgeBaseIds: ["a"], query: "question" },
  // @ts-expect-error Idempotency keys are only accepted by mutating operations.
  { idempotencyKey: "key" },
);
// @ts-expect-error A remote service owns its embedding configuration.
const invalidConfig: KnowledgeServiceConfiguration = {
  backend: {
    kind: "remote",
    provider: "mewvis-v1",
    endpoint: "https://example.test",
  },
  embedding: {
    provider: "other",
    endpoint: "https://example.test",
    model: "m",
  },
};
void invalidConfig;

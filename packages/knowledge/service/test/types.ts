import type {
  KnowledgeAttachmentStorage,
  KnowledgeAttachmentStorageFactory,
  KnowledgeAttachmentTransferProvider,
} from "@mewvis/knowledge-service";
import type { KnowledgeAttachmentStorage as PortStorage } from "@mewvis/knowledge-service/attachments";
import type { KnowledgeAttachmentStorageConfiguration } from "@mewvis/knowledge-sdk/configuration";

declare const factory: KnowledgeAttachmentStorageFactory;
declare const storage: KnowledgeAttachmentStorage;
const port: PortStorage = storage;
const config: KnowledgeAttachmentStorageConfiguration = {
  kind: "object-storage",
  storageId: "originals-v1",
  provider: "aliyun-oss",
  bucket: "originals",
  credentialRef: "object-store-secret",
};
void factory(config, {
  resolveCredential: async () => "resolved-by-caller",
  signal: new AbortController().signal,
});
const stored: Promise<{ sizeBytes: number; sha256: string }> = port.put({
  key: "service-generated-key",
  body: (async function* () {
    yield new Uint8Array([1, 2, 3]);
  })(),
  sizeBytes: 3,
  sha256: "a".repeat(64),
  mediaType: "application/octet-stream",
});
void stored;
void port.stat("service-generated-key");
void port.get("service-generated-key");
void port.delete("service-generated-key");
void port.probe();
void port.close();
declare const transfers: KnowledgeAttachmentTransferProvider;
void transfers.createUpload({
  key: "staging-key",
  fileName: "manual.pdf",
  mediaType: "application/pdf",
  sizeBytes: 128,
  sha256: "a".repeat(64),
  expiresAt: "2026-10-26T00:05:00.000Z",
});
void port.put({
  key: "service-generated-key",
  sizeBytes: 1,
  sha256: "a".repeat(64),
  mediaType: "text/plain",
  // @ts-expect-error Original bytes are streamed, never JSON/base64 or host paths.
  body: "/a/path",
});
// @ts-expect-error The adapter must return streaming bytes, not a local path or a public URL.
const wrongRead: ReturnType<KnowledgeAttachmentStorage["get"]> =
  Promise.resolve({ sizeBytes: 1, url: "file:///private" });
void wrongRead;

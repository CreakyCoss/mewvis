import { randomUUID } from "node:crypto";
import type {
  KnowledgeAttachment,
  KnowledgeAttachmentByteGateway,
  KnowledgeInput,
  KnowledgeMethod,
  KnowledgeOutput,
  KnowledgeRequest,
} from "@mewvis/knowledge-sdk";
import type { KnowledgeAttachmentStorage } from "../../attachments/index.js";
import { SqliteKnowledgeStore } from "./store.js";
import { fail, hash, now, checkSignal } from "../../util.js";

interface Row {
  id: string;
  base_id: string;
  owner_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  state: "pending" | "ready";
  created_at: string;
  updated_at: string;
}
interface Access {
  subjectId: string;
  ids: readonly string[] | undefined;
  methods: ReadonlySet<KnowledgeMethod>;
}
interface Grant {
  serviceId: string;
  subject: string;
  base: string;
  id: string;
  action: "GET" | "PUT";
  expires: number;
}
export class SqliteAttachments {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    private store: SqliteKnowledgeStore,
    private storage: KnowledgeAttachmentStorage,
    readonly maxBytes: number,
    private uploadExpiry: number,
    private retention: number,
  ) {}
  private value(row: Row): KnowledgeAttachment {
    return {
      id: row.id,
      knowledgeBaseId: row.base_id,
      fileName: row.file_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  private row(base: string, id: string, access?: Access): Row {
    const row =
      this.store.one<Row>(
        "SELECT * FROM kb_attachments WHERE base_id=? AND id=?",
        base,
        id,
      ) ?? fail("NOT_FOUND", "Attachment not found");
    if (row.state === "pending" && access && row.owner_id !== access.subjectId)
      fail("PERMISSION_DENIED", "Upload belongs to another subject");
    return row;
  }
  assertReference(base: string, id: string) {
    if (this.row(base, id).state !== "ready")
      fail("NOT_READY", "Original file has not completed upload");
  }
  private referenced(id: string): boolean {
    return Boolean(
      this.store.one(
        "SELECT 1 FROM kb_documents WHERE json_extract(input_json,'$.source.attachmentId')=? LIMIT 1",
        id,
      ) ||
      this.store.one(
        "SELECT 1 FROM kb_jobs j,json_each(j.payload_json,'$.documents') d WHERE j.state IN ('queued','running','cancelling') AND json_extract(d.value,'$.source.attachmentId')=? LIMIT 1",
        id,
      ),
    );
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.chain.then(work);
    this.chain = result.catch(() => {});
    return result;
  }
  private grant(row: Row, access: Access, action: "GET" | "PUT") {
    const expires =
      Date.now() + (action === "PUT" ? this.uploadExpiry : 5 * 60_000);
    return {
      kind: "host" as const,
      token: this.store.signAttachment({
        serviceId: this.store.serviceId,
        subject: access.subjectId,
        base: row.base_id,
        id: row.id,
        action,
        expires,
      } satisfies Grant),
      expiresAt: new Date(expires).toISOString(),
    };
  }
  private authorize(token: string, access: Access, action: "GET" | "PUT"): Row {
    const grant = this.store.verifyAttachment<Grant>(token);
    const method =
      action === "PUT"
        ? "attachments.createUpload"
        : "attachments.createDownload";
    if (
      grant.serviceId !== this.store.serviceId ||
      grant.subject !== access.subjectId ||
      grant.action !== action ||
      !Number.isFinite(grant.expires) ||
      grant.expires <= Date.now() ||
      !access.methods.has(method) ||
      (access.ids !== undefined && !access.ids.includes(grant.base))
    )
      fail("PERMISSION_DENIED", "Attachment transfer is invalid or expired");
    const row = this.row(grant.base, grant.id, access);
    if (row.state !== (action === "PUT" ? "pending" : "ready"))
      fail("CONFLICT", "Attachment is not in the required transfer state");
    return row;
  }
  gateway(access: Access, signal: AbortSignal): KnowledgeAttachmentByteGateway {
    return {
      upload: (token, body, context) =>
        this.serial(async () => {
          checkSignal(signal);
          this.store.assertOwner();
          const row = this.authorize(token, access, "PUT");
          const combined = context?.signal
            ? AbortSignal.any([signal, context.signal])
            : signal;
          await this.storage.put(
            {
              key: `staging/${row.id}`,
              body,
              mediaType: row.media_type,
              sizeBytes: row.size_bytes,
              sha256: row.sha256,
            },
            { signal: combined },
          );
        }),
      download: async (token, context) => {
        checkSignal(signal);
        this.store.assertOwner();
        const row = this.authorize(token, access, "GET");
        const combined = context?.signal
          ? AbortSignal.any([signal, context.signal])
          : signal;
        return {
          ...(await this.storage.get(`objects/${row.id}`, {
            signal: combined,
          })),
          fileName: row.file_name,
          mediaType: row.media_type,
          sizeBytes: row.size_bytes,
        };
      },
    };
  }
  async execute(
    request: KnowledgeRequest,
    access: Access,
    signal: AbortSignal,
  ): Promise<KnowledgeOutput<KnowledgeMethod>> {
    return this.serial(async () => {
      checkSignal(signal);
      this.store.assertOwner();
      const fingerprint = hash({
        method: request.method,
        params: request.params,
      });
      const cached = this.store.cachedReceipt<KnowledgeOutput<KnowledgeMethod>>(
        access.subjectId,
        request.idempotencyKey,
        fingerprint,
      );
      if (cached) return cached.value;
      const input =
        request.params as KnowledgeInput<"attachments.createUpload"> & {
          attachmentId: string;
          limit?: number;
          cursor?: string;
        };
      const base = input.knowledgeBaseId;
      this.store.base(base);
      if (request.method === "attachments.list")
        return this.store.page(
          "kb_attachments",
          "base_id=? AND (state='ready' OR owner_id=?)",
          [base, access.subjectId],
          input,
          { method: request.method, base, subject: access.subjectId },
          (row) => this.value(row as unknown as Row),
        );
      if (request.method === "attachments.createUpload")
        return this.store.receipt(
          access.subjectId,
          request.idempotencyKey,
          fingerprint,
          () => {
            if (input.sizeBytes > this.maxBytes)
              fail(
                "INVALID_ARGUMENT",
                "Original file exceeds the configured size limit",
              );
            if (
              this.store.one<{ n: number }>(
                "SELECT COUNT(*) n FROM kb_attachments WHERE state='pending'",
              )!.n >= 256
            )
              fail("RATE_LIMITED", "Too many unfinished uploads");
            const id = randomUUID(),
              stamp = now();
            this.store.run(
              "INSERT INTO kb_attachments VALUES(?,?,?,?,?,?,?,?,?,?)",
              id,
              base,
              access.subjectId,
              input.fileName,
              input.mediaType,
              input.sizeBytes,
              input.sha256,
              "pending",
              stamp,
              stamp,
            );
            const row = this.row(base, id, access);
            return {
              attachment: this.value(row),
              transfer: this.grant(row, access, "PUT"),
            };
          },
        );
      const row = this.row(base, input.attachmentId, access);
      if (request.method === "attachments.get") return this.value(row);
      if (request.method === "attachments.createDownload") {
        if (row.state !== "ready")
          fail("NOT_READY", "Original file has not completed upload");
        return {
          knowledgeBaseId: base,
          attachmentId: row.id,
          transfer: this.grant(row, access, "GET"),
        };
      }
      if (request.method === "attachments.completeUpload") {
        if (row.state === "pending") {
          if (Date.now() - Date.parse(row.created_at) >= this.uploadExpiry)
            fail(
              "NOT_READY",
              "Upload session has expired; create a new upload",
            );
          const object = await this.storage.get(`staging/${row.id}`, {
            signal,
          });
          await this.storage.put(
            {
              key: `objects/${row.id}`,
              body: object.body,
              mediaType: row.media_type,
              sizeBytes: row.size_bytes,
              sha256: row.sha256,
            },
            { signal },
          );
        }
        return this.store.receipt(
          access.subjectId,
          request.idempotencyKey,
          fingerprint,
          () => {
            this.row(base, row.id, access);
            this.store.run(
              "UPDATE kb_attachments SET state='ready',updated_at=? WHERE id=?",
              now(),
              row.id,
            );
            this.store.run(
              "INSERT OR IGNORE INTO kb_attachment_cleanup VALUES(?)",
              `staging/${row.id}`,
            );
            return this.value(this.row(base, row.id, access));
          },
        );
      }
      return this.store.receipt(
        access.subjectId,
        request.idempotencyKey,
        fingerprint,
        () => {
          if (request.method === "attachments.abortUpload") {
            if (row.state === "ready")
              fail("CONFLICT", "Completed originals cannot be aborted");
          } else if (request.method !== "attachments.delete")
            fail("NOT_SUPPORTED", "Attachment operation is not implemented");
          if (this.referenced(row.id))
            fail(
              "CONFLICT",
              "Original file is still referenced by a document or active job",
            );
          this.store.run("DELETE FROM kb_attachments WHERE id=?", row.id);
          return request.method === "attachments.abortUpload"
            ? {
                knowledgeBaseId: base,
                attachmentId: row.id,
                aborted: true as const,
              }
            : {
                knowledgeBaseId: base,
                attachmentId: row.id,
                deleted: true as const,
              };
        },
      );
    });
  }
  cleanup(): Promise<void> {
    return this.serial(async () => {
      this.store.assertOwner();
      const current = Date.now();
      for (const row of this.store.all<Row>(
        `SELECT a.* FROM kb_attachments a
         WHERE ((a.state='pending' AND a.created_at<?) OR (a.state='ready' AND a.updated_at<?))
         AND NOT EXISTS (SELECT 1 FROM kb_documents WHERE json_extract(input_json,'$.source.attachmentId')=a.id)
         AND NOT EXISTS (SELECT 1 FROM kb_jobs j,json_each(j.payload_json,'$.documents') d
           WHERE j.state IN ('queued','running','cancelling') AND json_extract(d.value,'$.source.attachmentId')=a.id)
         LIMIT 256`,
        new Date(current - this.uploadExpiry).toISOString(),
        new Date(current - this.retention).toISOString(),
      )) {
        const expired =
          row.state === "pending"
            ? current - Date.parse(row.created_at) > this.uploadExpiry
            : current - Date.parse(row.updated_at) > this.retention;
        if (expired && !this.referenced(row.id))
          this.store.transaction(() =>
            this.store.run("DELETE FROM kb_attachments WHERE id=?", row.id),
          );
      }
      for (const row of this.store.all<{ key: string }>(
        "SELECT key FROM kb_attachment_cleanup LIMIT 512",
      )) {
        try {
          await this.storage.delete(row.key);
          this.store.run(
            "DELETE FROM kb_attachment_cleanup WHERE key=?",
            row.key,
          );
        } catch {
          /* Persist for the next cleanup pass. */
        }
      }
    });
  }
  async close() {
    await this.chain;
    await this.cleanup();
    await this.storage.close();
  }
}

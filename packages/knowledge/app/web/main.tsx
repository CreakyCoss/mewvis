import { useMemo, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  createKnowledgeClient,
  type KnowledgeClient,
  type KnowledgeAttachmentReference,
  type KnowledgeTextDocument,
  type KnowledgeDocument,
} from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import { KnowledgeApplication } from "@mewvis/knowledge-ui";
import { Button } from "design-system/components/ui/button";
import "./styles.css";
import { downloadOriginal, type OriginalFile } from "./original-file.js";
const OriginalViewer = lazy(() =>
  import("./original-viewer.js").then((module) => ({
    default: module.OriginalViewer,
  })),
);

function App() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState<OriginalFile>();
  const client: KnowledgeClient = useMemo(
    () =>
      createKnowledgeClient(
        createKnowledgeHttpTransport({
          endpoint: new URL("/api/knowledge", window.location.origin).href,
          headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
        }),
        { timeoutMs: 60_000 },
      ),
    [token],
  );
  const headers = (): Record<string, string> =>
    token ? { authorization: `Bearer ${token}` } : {};
  const checked = async (response: Response) => {
    if (response.ok) return response;
    const result = (await response.json().catch(() => undefined)) as
      { error?: { message?: string } } | undefined;
    if (response.status === 401) setNeedsLogin(true);
    throw new Error(result?.error?.message ?? "原件操作失败，请重试。");
  };
  const parseAttachment = async (
    reference: KnowledgeAttachmentReference,
    signal?: AbortSignal,
  ): Promise<KnowledgeTextDocument> => {
    const response = await checked(
      await fetch("/api/knowledge/parse", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify(reference),
        ...(signal ? { signal } : {}),
        redirect: "error",
      }),
    );
    return response.json() as Promise<KnowledgeTextDocument>;
  };
  const readOriginal = async (
    reference: KnowledgeAttachmentReference,
  ): Promise<OriginalFile> => {
    const metadata = await client.attachments.get(reference);
    const download = await client.attachments.createDownload(reference);
    if (download.transfer.kind !== "host")
      throw new Error("当前独立应用只提供本地原件传输。");
    const response = await checked(
      await fetch("/api/knowledge/files", {
        headers: {
          ...headers(),
          "x-knowledge-transfer": download.transfer.token,
        },
        redirect: "error",
      }),
    );
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      fileName: metadata.fileName,
      mediaType: metadata.mediaType,
    };
  };
  const prepareFile = async (
    file: File,
    signal: AbortSignal,
    knowledgeBaseId: string,
  ): Promise<KnowledgeTextDocument> => {
    if (file.size > 32 * 1024 * 1024)
      throw new Error("单个文件最多 32 MiB，请拆分后导入。");
    if (!/\.(pdf|txt|md|markdown)$/i.test(file.name))
      throw new Error("当前支持 PDF、TXT 和 Markdown；其他格式尚未实现。");
    const sha256 = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const mediaType = /\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.(md|markdown)$/i.test(file.name)
        ? "text/markdown"
        : "text/plain";
    const upload = await client.attachments.createUpload(
      {
        knowledgeBaseId,
        fileName: file.name,
        mediaType,
        sizeBytes: file.size,
        sha256,
      },
      { signal, idempotencyKey: crypto.randomUUID() },
    );
    const reference = { knowledgeBaseId, attachmentId: upload.attachment.id };
    let completed = false;
    try {
      if (upload.transfer.kind !== "host")
        throw new Error("当前独立应用只提供本地原件传输。");
      await checked(
        await fetch("/api/knowledge/files", {
          method: "PUT",
          headers: {
            ...headers(),
            "x-knowledge-transfer": upload.transfer.token,
            "content-type": mediaType,
          },
          body: file,
          signal,
          redirect: "error",
        }),
      );
      await client.attachments.completeUpload(reference, {
        signal,
        idempotencyKey: crypto.randomUUID(),
      });
      completed = true;
      return await parseAttachment(reference, signal);
    } catch (error) {
      await (
        completed
          ? client.attachments.delete(reference)
          : client.attachments.abortUpload(reference)
      ).catch(() => {});
      throw error;
    }
  };
  if (needsLogin)
    return (
      <main className="knowledge-connect knowledge-ui">
        <h1>连接知识库</h1>
        <p>输入此服务的访问令牌，继续使用知识库。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const next = createKnowledgeClient(
              createKnowledgeHttpTransport({
                endpoint: new URL("/api/knowledge", window.location.origin)
                  .href,
                headers: { authorization: `Bearer ${draft.trim()}` },
              }),
              { timeoutMs: 15_000 },
            );
            void next.service
              .describe()
              .then(
                () => {
                  setToken(draft.trim());
                  setDraft("");
                  setNeedsLogin(false);
                },
                () => setError("连接失败，请检查访问令牌和服务状态。"),
              )
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="knowledge-token">访问令牌</label>
          <input
            id="knowledge-token"
            className="knowledge-input"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            required
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !draft.trim()}>
            {busy ? "连接中…" : "连接"}
          </Button>
        </form>
      </main>
    );
  return (
    <>
      <KnowledgeApplication
        client={client}
        serviceLabel="个人资料服务"
        navigation
        preferences={localStorage}
        parseFile={prepareFile}
        acceptedFileTypes=".pdf,.txt,.md,.markdown"
        fileFormatLabel="支持 PDF、TXT、Markdown · 原件保存到本地 · 单个文件最多 32 MiB"
        onDiscardDocument={async (document, knowledgeBaseId) => {
          if (document.source?.attachmentId)
            await client.attachments.delete({
              knowledgeBaseId,
              attachmentId: document.source.attachmentId,
            });
        }}
        onOpenAttachment={async (reference) =>
          setOriginal(await readOriginal(reference))
        }
        onDownloadAttachment={async (reference) =>
          downloadOriginal(await readOriginal(reference))
        }
        onReparseDocument={async (document: KnowledgeDocument) =>
          parseAttachment({
            knowledgeBaseId: document.knowledgeBaseId,
            attachmentId: document.source!.attachmentId!,
          })
        }
        onUnauthenticated={() => {
          setToken("");
          setNeedsLogin(true);
        }}
      />
      {original && (
        <Suspense fallback={<p role="status">正在加载原件预览…</p>}>
          <OriginalViewer
            file={original}
            onClose={() => setOriginal(undefined)}
          />
        </Suspense>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

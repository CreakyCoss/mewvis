import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  FileText,
  Upload,
  X,
  LoaderCircle,
  AlertCircle,
  Database,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "design-system/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "design-system/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "design-system/components/ui/tabs";
import type {
  KnowledgeBase,
  KnowledgeBaseCreateInput,
  KnowledgeDocument,
  KnowledgeImportInput,
  KnowledgeMutationOptions,
  KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";
import { KnowledgeDocumentView } from "./reader.js";
import { digestText, errorText, parseTextFile } from "./helpers.js";

export interface KnowledgeBaseDialogProps {
  readonly base?: KnowledgeBase;
  readonly pending?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: KnowledgeBaseCreateInput) => Promise<void>;
}
export function KnowledgeBaseDialog(props: KnowledgeBaseDialogProps) {
  const [name, setName] = useState(props.base?.name ?? "");
  const [description, setDescription] = useState(props.base?.description ?? "");
  const [error, setError] = useState("");
  const Surface = props.base ? Sheet : Dialog;
  const Content = props.base ? SheetContent : DialogContent;
  const Title = props.base ? SheetTitle : DialogTitle;
  const Description = props.base ? SheetDescription : DialogDescription;
  return (
    <Surface
      open
      onOpenChange={(open) => {
        if (!open && !props.pending) props.onClose();
      }}
    >
      <Content
        className={`knowledge-ui knowledge-base-dialog ${props.base ? "knowledge-edit-drawer" : ""}`}
        showCloseButton={!props.pending}
        onEscapeKeyDown={(event) => {
          if (props.pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (props.pending) event.preventDefault();
        }}
      >
        <div className="knowledge-dialog-heading">
          <span className="knowledge-icon-tile">
            <Database />
          </span>
          <div>
            <Title>{props.base ? "编辑知识库" : "新建知识库"}</Title>
            <Description>为资料起一个容易识别的名称。</Description>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            void props
              .onSubmit({ name: name.trim(), description: description.trim() })
              .catch((reason) => setError(errorText(reason)));
          }}
        >
          <label htmlFor="knowledge-base-name">知识库名称</label>
          <input
            id="knowledge-base-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            autoFocus
            required
            disabled={props.pending}
          />
          <label htmlFor="knowledge-base-description">
            描述 <span className="knowledge-muted">（选填）</span>
          </label>
          <textarea
            id="knowledge-base-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            disabled={props.pending}
            placeholder="这里保存哪些资料？"
          />
          {error && (
            <p role="alert" className="knowledge-error">
              {error}
            </p>
          )}
          <div className="knowledge-dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={props.onClose}
              disabled={props.pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={!name.trim() || props.pending}>
              {props.pending && <LoaderCircle className="knowledge-spin" />}
              {props.base ? "保存修改" : "创建知识库"}
            </Button>
          </div>
        </form>
      </Content>
    </Surface>
  );
}

export interface KnowledgeImportDialogProps {
  readonly bases: readonly KnowledgeBase[];
  readonly knowledgeBaseId: string;
  readonly replacement?: KnowledgeDocument;
  readonly pending?: boolean;
  readonly idempotency?: boolean;
  readonly parseFile?: (
    file: File,
    signal: AbortSignal,
  ) => Promise<KnowledgeTextDocument>;
  readonly onClose: () => void;
  readonly onSubmit: (
    input: KnowledgeImportInput,
    options?: KnowledgeMutationOptions,
  ) => Promise<void>;
}
interface Entry {
  id: string;
  name: string;
  bytes: number;
  document?: KnowledgeTextDocument;
  error?: string;
}
export function KnowledgeImportDialog(props: KnowledgeImportDialogProps) {
  const [target, setTarget] = useState(props.knowledgeBaseId);
  const [tab, setTab] = useState("files");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState("");
  const [title, setTitle] = useState(props.replacement?.title ?? "未命名文本");
  const [text, setText] = useState("");
  const [policy, setPolicy] = useState<"skip" | "reject" | "replace">("skip");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef(new AbortController());
  const receipt = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  useEffect(() => () => controller.current.abort(), []);
  const chosenBase = props.bases.find((base) => base.id === target);
  const maximum = Math.min(
    100,
    chosenBase?.capabilities.limits?.maxImportDocuments ?? 100,
  );
  const busy = Boolean(props.pending || submitting);
  const parsing = entries.some((entry) => !entry.document && !entry.error);
  const ready = entries.filter((entry) => entry.document);
  const selectedEntry =
    entries.find((entry) => entry.id === selected) ?? entries[0];
  const preview = tab === "text" ? text : (selectedEntry?.document?.text ?? "");
  const previewTitle =
    tab === "text"
      ? title
      : (selectedEntry?.document?.title ?? selectedEntry?.name ?? "");
  const previewChars = Array.from(preview);
  const addFiles = async (files: readonly File[]) => {
    if (busy) return;
    setError("");
    if (props.replacement && files.length + entries.length > 1) {
      setError("替换文档时请只选择一个文件，或移除当前文件后重新选择。");
      return;
    }
    if (entries.length + files.length > maximum) {
      setError(`每次最多导入 ${maximum} 份文档。`);
      return;
    }
    if (
      files.reduce(
        (total, file) => total + file.size,
        entries.reduce((total, entry) => total + entry.bytes, 0),
      ) >
      16 * 1024 * 1024
    ) {
      setError("本次文件总大小最多 16 MiB，请分批导入。");
      return;
    }
    const pending = files.map((file) => ({ file, id: crypto.randomUUID() }));
    setEntries((old) => [
      ...old,
      ...pending.map(({ id, file }) => ({
        id,
        name: file.name,
        bytes: file.size,
      })),
    ]);
    if (!selected && pending[0]) setSelected(pending[0].id);
    for (const { id, file } of pending) {
      if (controller.current.signal.aborted) return;
      try {
        const document = await (props.parseFile ?? parseTextFile)(
          file,
          controller.current.signal,
        );
        const limit =
          chosenBase?.capabilities.limits?.maxDocumentCharacters ?? 2_000_000;
        if (!document.text.trim() || Array.from(document.text).length > limit)
          throw new Error(
            `正文为空或超过 ${limit.toLocaleString()} 字，请检查内容。`,
          );
        if (!document.externalId)
          throw new Error("文件解析器未提供稳定的资料标识，无法判断重复资料。");
        if (!controller.current.signal.aborted)
          setEntries((old) =>
            old.map((entry) =>
              entry.id === id ? { ...entry, document } : entry,
            ),
          );
      } catch (reason) {
        if (!controller.current.signal.aborted)
          setEntries((old) =>
            old.map((entry) =>
              entry.id === id ? { ...entry, error: errorText(reason) } : entry,
            ),
          );
      }
    }
  };
  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      let documents: KnowledgeTextDocument[];
      if (tab === "text") {
        const sha256 = await digestText(text);
        documents = [
          {
            title: title.trim(),
            text,
            externalId: `text-sha256:${sha256}`,
            source: { mediaType: "text/plain", uri: `urn:sha256:${sha256}` },
          },
        ];
      } else documents = ready.map((entry) => entry.document!);
      if (
        !documents.length ||
        documents.some(
          (document) => !document.title.trim() || !document.text.trim(),
        )
      )
        throw new Error("请提供有效的标题与正文。");
      if (
        documents.some(
          (document) =>
            Array.from(document.text).length >
            (chosenBase?.capabilities.limits?.maxDocumentCharacters ??
              2_000_000),
        )
      )
        throw new Error("正文超过知识库允许的长度，请拆分后导入。");
      if (props.replacement) {
        if (!props.replacement.externalId)
          throw new Error("此文档缺少稳定标识，暂不支持直接替换。");
        documents = [
          { ...documents[0]!, externalId: props.replacement.externalId },
        ];
      }
      const payload: KnowledgeImportInput = {
        knowledgeBaseId: target,
        documents,
        duplicatePolicy: props.replacement ? "replace" : policy,
      };
      const fingerprint = JSON.stringify(payload);
      if (new TextEncoder().encode(fingerprint).byteLength > 15 * 1024 * 1024)
        throw new Error("本次正文较多，请减少文档数量后分批导入。");
      if (
        new Set(documents.map((document) => document.externalId)).size !==
        documents.length
      )
        throw new Error("本次选择了相同内容，请移除重复文件后再导入。");
      if (receipt.current?.fingerprint !== fingerprint)
        receipt.current = { fingerprint, key: crypto.randomUUID() };
      await props.onSubmit(
        payload,
        props.idempotency ? { idempotencyKey: receipt.current.key } : {},
      );
    } catch (reason) {
      if (!controller.current.signal.aborted) setError(errorText(reason));
    } finally {
      if (!controller.current.signal.aborted) setSubmitting(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
    >
      <DialogContent
        className="knowledge-ui knowledge-import-dialog"
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="knowledge-dialog-heading">
          <span className="knowledge-icon-tile">
            <Upload />
          </span>
          <div>
            <DialogTitle>
              {props.replacement ? "替换文档" : "导入文档"}
            </DialogTitle>
            <DialogDescription>
              选择资料，确认内容后加入知识库。
            </DialogDescription>
          </div>
        </div>
        <div className="knowledge-import-target">
          <label htmlFor="knowledge-import-base">导入到</label>
          <select
            id="knowledge-import-base"
            value={target}
            disabled={busy || Boolean(props.replacement)}
            onChange={(event) => setTarget(event.target.value)}
          >
            {props.bases
              .filter((base) =>
                base.capabilities.methods.includes("documents.import"),
              )
              .map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                </option>
              ))}
          </select>
        </div>
        <div className="knowledge-import-body">
          <div className="knowledge-import-input">
            <h3>添加资料</h3>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList variant="line">
                <TabsTrigger value="files" disabled={busy}>
                  上传文件
                </TabsTrigger>
                <TabsTrigger value="text" disabled={busy}>
                  粘贴文本
                </TabsTrigger>
              </TabsList>
              <TabsContent value="files">
                <div
                  className={`knowledge-dropzone ${dragging ? "is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void addFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <Upload size={30} />
                  <p>拖入文件，或选择文件</p>
                  <span className="knowledge-muted">
                    {props.parseFile
                      ? "按当前导入器支持的格式选择资料"
                      : "支持 TXT、Markdown · UTF-8"}
                  </span>
                  <input
                    ref={input}
                    type="file"
                    multiple={!props.replacement}
                    accept={props.parseFile ? undefined : ".txt,.md,.markdown"}
                    hidden
                    onChange={fileChange}
                    disabled={busy}
                  />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => input.current?.click()}
                    disabled={busy}
                  >
                    选择文件
                  </Button>
                </div>
                <p className="knowledge-file-count">
                  已选文件 · {entries.length}
                </p>
                <div className="knowledge-file-list">
                  {entries.map((entry) => (
                    <div
                      className={`knowledge-file-entry ${selectedEntry?.id === entry.id ? "is-selected" : ""}`}
                      key={entry.id}
                    >
                      <button
                        type="button"
                        className="knowledge-file-select"
                        onClick={() => setSelected(entry.id)}
                      >
                        <FileText size={22} />
                        <span>
                          <strong>{entry.name}</strong>
                          <small>
                            {(entry.bytes / 1024).toFixed(1)} KB ·{" "}
                            {entry.error
                              ? entry.error
                              : entry.document
                                ? "已解析"
                                : "解析中…"}
                          </small>
                        </span>
                      </button>
                      {entry.error ? (
                        <AlertCircle className="knowledge-error" size={18} />
                      ) : entry.document ? (
                        <CheckCircle2 className="knowledge-success" size={18} />
                      ) : (
                        <LoaderCircle size={18} className="knowledge-spin" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`移除 ${entry.name}`}
                        disabled={busy}
                        onClick={() =>
                          setEntries((old) =>
                            old.filter((item) => item.id !== entry.id),
                          )
                        }
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="text">
                <label htmlFor="knowledge-paste-title">文档标题</label>
                <input
                  id="knowledge-paste-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  disabled={busy}
                />
                <label htmlFor="knowledge-paste-text">正文</label>
                <textarea
                  id="knowledge-paste-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={11}
                  disabled={busy}
                  placeholder="粘贴需要入库的资料…"
                />
              </TabsContent>
            </Tabs>
            {props.replacement ? (
              <p className="knowledge-import-help">
                将替换《{props.replacement.title}》。新版本完成前保留现有内容。
              </p>
            ) : (
              <div className="knowledge-import-policy">
                <label htmlFor="knowledge-duplicate">遇到重复资料</label>
                <select
                  id="knowledge-duplicate"
                  value={policy}
                  onChange={(event) =>
                    setPolicy(event.target.value as typeof policy)
                  }
                  disabled={busy}
                >
                  <option value="skip">跳过已有资料</option>
                  <option value="reject">报告重复错误</option>
                  <option value="replace">更新相同内容的资料</option>
                </select>
                <p>相同内容视为重复资料；替换指定文档请从文档操作进入。</p>
              </div>
            )}
          </div>
          <div className="knowledge-import-preview">
            <div className="knowledge-preview-heading">
              <h3>内容预览</h3>
              <p>
                {previewTitle || "尚未选择资料"}
                <span>
                  {preview
                    ? `约 ${previewChars.length.toLocaleString()} 字`
                    : ""}
                </span>
              </p>
            </div>
            <div className="knowledge-preview-paper">
              {preview ? (
                <KnowledgeDocumentView
                  showTitle
                  document={{
                    id: "preview",
                    knowledgeBaseId: target,
                    title: previewTitle || "正文",
                    text: previewChars.slice(0, 20_000).join(""),
                    state: "ready",
                  }}
                />
              ) : (
                <div className="knowledge-preview-empty">
                  <FileText size={32} />
                  <p>
                    选择文件或粘贴文本后，
                    <br />
                    在这里核对正文内容。
                  </p>
                </div>
              )}
            </div>
            {previewChars.length > 20_000 && (
              <p className="knowledge-muted">
                预览显示前 20,000 字，导入时保留完整正文。
              </p>
            )}
          </div>
        </div>
        <div className="knowledge-import-footer">
          <div>
            <p>
              {parsing
                ? "正在解析资料…"
                : `已准备 ${tab === "text" ? (text.trim() ? 1 : 0) : ready.length} 份文档`}
            </p>
            <small>导入进度可在任务中查看。</small>
          </div>
          <div>
            {error && (
              <p className="knowledge-error" role="alert">
                {error}
              </p>
            )}
            <div className="knowledge-dialog-actions">
              <Button variant="outline" onClick={props.onClose} disabled={busy}>
                取消
              </Button>
              <Button
                onClick={() => {
                  void submit();
                }}
                disabled={
                  busy ||
                  parsing ||
                  !target ||
                  (tab === "text"
                    ? !text.trim() || !title.trim()
                    : !ready.length)
                }
              >
                {busy && <LoaderCircle className="knowledge-spin" />}
                {busy ? "提交中…" : props.replacement ? "确认替换" : "开始导入"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Braces, FileCode2, LoaderCircle, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  StoryDocument,
  StoryDocumentIdentity,
  StoryProjectStructure,
  StoryValue,
} from "../../../../../../../core/story-project/types";
import { isJsonObject, storyDocumentData, storyDocumentKey, storyDocumentLabel } from "../../../story-document";
import { useStoryState } from "../../use-story-state";
import { StoryDocumentForm } from "./form";
import { createDocumentValue } from "./structure";

type DocumentSchema = StoryProjectStructure["schemas"]["documents"][string];

const generatedDocumentId = () =>
  globalThis.crypto?.randomUUID?.() ?? `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sourceText = (document: StoryDocument, value: StoryValue) => {
  if (document.definition?.contentFormat === "markdown") {
    const data = isJsonObject(value) ? value : null;
    return typeof data?.content === "string" ? data.content : "";
  }
  return JSON.stringify(value, null, 2);
};

const createIdentity = (schema: DocumentSchema): StoryDocumentIdentity["identity"] =>
  Object.fromEntries(schema.identityFields.map((field) => [field, field === "id" ? generatedDocumentId() : ""]));

const editorDocumentForSchema = (
  kind: string,
  schema: DocumentSchema,
  structure: StoryProjectStructure,
  identity: StoryDocumentIdentity["identity"],
  value: StoryValue,
): StoryDocument => ({
  ref: { kind, identity },
  value,
  updatedAt: null,
  displayName: schema.label,
  definition: {
    kind,
    label: schema.label,
    contentFormat: schema.contentFormat,
    fields: schema.fields,
    definitions: structure.schemas.objectDefinitions,
  },
});

const draftSnapshot = (kind: string, identity: StoryDocumentIdentity["identity"], rawText: string) =>
  JSON.stringify({ kind, identity, rawText });

export const StoryDocumentDialog = ({
  document,
  onOpenChange,
  onSaved,
  open,
}: {
  document: StoryDocument | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (document: StoryDocument) => void;
  open: boolean;
}) => {
  const createDocument = useStoryState((state) => state.createDocument);
  const documents = useStoryState((state) => state.documents);
  const documentStructure = useStoryState((state) => state.documentStructure);
  const isLoadingStructure = useStoryState((state) => state.isLoadingDocumentStructure);
  const isSaving = useStoryState((state) => state.isSaving);
  const loadDocumentStructure = useStoryState((state) => state.loadDocumentStructure);
  const saveDocument = useStoryState((state) => state.saveDocument);
  const [selectedKind, setSelectedKind] = useState("");
  const [identity, setIdentity] = useState<StoryDocumentIdentity["identity"]>({});
  const [draft, setDraft] = useState<StoryValue>({});
  const [rawText, setRawText] = useState("{}");
  const [rawError, setRawError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [viewMode, setViewMode] = useState<"form" | "source">("form");
  const [baseline, setBaseline] = useState("");
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState("");

  const availableKinds = useMemo(() => {
    if (!documentStructure) return [];
    return Object.entries(documentStructure.documents)
      .filter(
        ([kind, definition]) =>
          kind !== documentStructure.storyType.manifestKind &&
          (definition.cardinality === "many" || !documents.some((item) => item.ref.kind === kind)),
      )
      .sort(([, left], [, right]) => left.label.localeCompare(right.label, "zh-CN"));
  }, [documentStructure, documents]);

  useEffect(() => {
    if (open && !document && !documentStructure) void loadDocumentStructure();
  }, [document, documentStructure, loadDocumentStructure, open]);

  useEffect(() => {
    if (!open) {
      setSelectedKind("");
      setBaseline("");
      setRawError("");
      setIdentityError("");
      setPendingKind("");
      setViewMode("form");
      return;
    }
    if (!document) return;
    const nextRawText = sourceText(document, document.value);
    setSelectedKind(document.ref.kind);
    setIdentity(document.ref.identity);
    setDraft(document.value);
    setRawText(nextRawText);
    setRawError("");
    setIdentityError("");
    setViewMode("form");
    setBaseline(draftSnapshot(document.ref.kind, document.ref.identity, nextRawText));
  }, [document, open]);

  const initializeCreateKind = (kind: string) => {
    if (!documentStructure) return;
    const schema = documentStructure.schemas.documents[kind];
    if (!schema) return;
    const nextIdentity = createIdentity(schema);
    const nextValue = createDocumentValue(schema.fields, documentStructure.schemas.objectDefinitions);
    const valueWithIdentity = isJsonObject(nextValue) ? { ...nextValue, ...nextIdentity } : nextValue;
    const nextDocument = editorDocumentForSchema(kind, schema, documentStructure, nextIdentity, valueWithIdentity);
    const nextRawText = sourceText(nextDocument, valueWithIdentity);
    setSelectedKind(kind);
    setIdentity(nextIdentity);
    setDraft(valueWithIdentity);
    setRawText(nextRawText);
    setRawError("");
    setIdentityError("");
    setViewMode("form");
    if (!baseline) setBaseline(draftSnapshot(kind, nextIdentity, nextRawText));
  };

  useEffect(() => {
    if (open && !document && documentStructure && !selectedKind && availableKinds[0]) {
      initializeCreateKind(availableKinds[0][0]);
    }
  }, [availableKinds, document, documentStructure, open, selectedKind]);

  const schema = !document && documentStructure ? documentStructure.schemas.documents[selectedKind] : null;
  const editorDocument =
    document ??
    (schema && documentStructure
      ? editorDocumentForSchema(selectedKind, schema, documentStructure, identity, draft)
      : null);
  const isMarkdown = editorDocument?.definition?.contentFormat === "markdown";
  const currentSnapshot = draftSnapshot(selectedKind, identity, rawText);
  const isDirty = Boolean(baseline && currentSnapshot !== baseline);
  const visibleIdentityFields = schema?.identityFields.filter((field) => field !== "id") ?? [];

  const updateDraft = (value: StoryValue) => {
    setDraft(value);
    if (editorDocument) setRawText(sourceText(editorDocument, value));
    setRawError("");
  };

  const updateIdentity = (field: string, value: string) => {
    const nextIdentity = { ...identity, [field]: value };
    setIdentity(nextIdentity);
    setIdentityError("");
    if (isJsonObject(draft)) updateDraft({ ...draft, [field]: value });
  };

  const parseRaw = () => {
    if (!editorDocument) return { valid: false as const };
    if (isMarkdown) {
      const data = storyDocumentData({ ...editorDocument, value: draft });
      const value = { ...(data ?? {}), ...identity, content: rawText } as StoryValue;
      setDraft(value);
      setRawError("");
      return { valid: true as const, value };
    }
    try {
      const parsed = JSON.parse(rawText) as StoryValue;
      if (!isJsonObject(parsed)) {
        setRawError("文档源码必须是一个 JSON 对象。");
        return { valid: false as const };
      }
      const value = { ...parsed, ...identity };
      setDraft(value);
      setRawError("");
      return { valid: true as const, value };
    } catch {
      setRawError("JSON 格式无效，请修正后再保存或返回表单编辑。");
      return { valid: false as const };
    }
  };

  const switchViewMode = () => {
    if (viewMode === "form") {
      setViewMode("source");
      return;
    }
    const result = parseRaw();
    if (result.valid) setViewMode("form");
  };

  const requestKindChange = (kind: string) => {
    if (isDirty) {
      setPendingKind(kind);
      return;
    }
    initializeCreateKind(kind);
  };

  const save = async () => {
    if (!editorDocument) return;
    const missingIdentity = Object.entries(identity).find(([, value]) => !value.trim());
    if (missingIdentity) {
      const label = schema?.fields[missingIdentity[0]]?.label ?? missingIdentity[0];
      setIdentityError(`请填写${label}。`);
      setViewMode("form");
      return;
    }
    const result = parseRaw();
    if (!result.valid) return;
    const saved = document
      ? await saveDocument({ ref: document.ref, value: result.value })
      : await createDocument({ kind: selectedKind, identity }, result.value);
    if (!saved) return;
    toast.success(document ? "故事资料已保存。" : "故事资料已创建。");
    onSaved(saved);
    onOpenChange(false);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (isSaving) return;
    if (isDirty) {
      setIsDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent
          className="!flex h-[min(90vh,52rem)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
          overlayClassName="bg-black/45"
        >
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <DialogTitle className="text-lg">
                  {document ? `编辑“${storyDocumentLabel(document)}”` : "新增故事资料"}
                </DialogTitle>
                <DialogDescription className="mt-1.5">
                  {document
                    ? "在弹窗中集中修改内容；关闭后页面会继续保持清晰的阅读模式。"
                    : "从当前故事支持的标准文档中选择类型，表单会自动生成所需字段。"}
                </DialogDescription>
              </div>
              {editorDocument ? (
                <Button type="button" size="sm" variant="outline" className="mr-1 self-start" onClick={switchViewMode}>
                  {viewMode === "form" ? <FileCode2 className="size-4" /> : <Braces className="size-4" />}
                  {viewMode === "form" ? `编辑${isMarkdown ? " Markdown" : " JSON"}源码` : "返回表单"}
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          {!document ? (
            <div className="shrink-0 border-b bg-muted/20 px-6 py-4">
              {documentStructure && availableKinds.length > 0 ? (
                <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="story-document-type">资料类型</Label>
                    <Select value={selectedKind} onValueChange={requestKindChange}>
                      <SelectTrigger id="story-document-type" className="w-full bg-background">
                        <SelectValue placeholder="选择标准文档" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableKinds.map(([kind, definition]) => (
                          <SelectItem key={kind} value={kind}>
                            {definition.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-h-9 items-center gap-2 text-xs leading-5 text-muted-foreground">
                    <Sparkles className="size-4 shrink-0 text-primary" />
                    <span>{schema?.description ?? "字段、默认值和文档标识均来自当前故事的标准结构。"}</span>
                  </div>
                </div>
              ) : isLoadingStructure ? (
                <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  正在读取标准文档结构…
                </div>
              ) : documentStructure ? (
                <p className="text-sm text-muted-foreground">当前故事没有可新增的标准文档。</p>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">标准文档结构读取失败。</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadDocumentStructure()}>
                    重试
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {editorDocument ? (
            <>
              {viewMode === "form" && visibleIdentityFields.length > 0 ? (
                <div className="grid shrink-0 gap-4 border-b bg-primary/[0.025] px-6 py-4 sm:grid-cols-2">
                  {visibleIdentityFields.map((field) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={`story-document-identity-${field}`}>
                        {schema?.fields[field]?.label ?? field}
                        <span className="ml-0.5 text-destructive">*</span>
                      </Label>
                      <Input
                        id={`story-document-identity-${field}`}
                        value={identity[field] ?? ""}
                        aria-invalid={Boolean(identityError && !identity[field]?.trim())}
                        placeholder={`填写${schema?.fields[field]?.label ?? field}`}
                        onChange={(event) => updateIdentity(field, event.currentTarget.value)}
                      />
                    </div>
                  ))}
                  {identityError ? (
                    <p role="alert" className="text-xs text-destructive sm:col-span-2">
                      {identityError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {viewMode === "form" ? (
                <StoryDocumentForm
                  key={storyDocumentKey(editorDocument)}
                  document={editorDocument}
                  value={draft}
                  onChange={updateDraft}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2 px-6 py-5">
                  <Label htmlFor="story-document-source">{isMarkdown ? "Markdown 正文" : "JSON 源码"}</Label>
                  <Textarea
                    id="story-document-source"
                    value={rawText}
                    className="min-h-0 flex-1 resize-none bg-muted/15 font-mono text-xs leading-5"
                    spellCheck={false}
                    aria-invalid={Boolean(rawError)}
                    onChange={(event) => {
                      setRawText(event.currentTarget.value);
                      setRawError("");
                    }}
                    onBlur={() => void parseRaw()}
                  />
                  {rawError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {rawError}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <div className="min-h-0 flex-1" />
          )}

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => requestOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={isSaving || !editorDocument || (!document && !selectedKind) || (document ? !isDirty : false)}
              onClick={() => void save()}
            >
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? (document ? "保存中" : "创建中") : document ? "保存修改" : "创建资料"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>当前弹窗中的修改尚未保存，放弃后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setIsDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingKind)} onOpenChange={(nextOpen) => !nextOpen && setPendingKind("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>切换资料类型？</AlertDialogTitle>
            <AlertDialogDescription>切换后会按新类型重新生成表单，当前填写的内容将被清空。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留当前内容</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const nextKind = pendingKind;
                setPendingKind("");
                initializeCreateKind(nextKind);
              }}
            >
              切换类型
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

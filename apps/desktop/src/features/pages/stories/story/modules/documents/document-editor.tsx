import { useEffect, useMemo, useState } from "react";
import { Braces, CheckCircle2, ChevronRight, FileCode2, MoreHorizontal, Save, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  StoryProjectDocuments,
  type JsonFieldMetadata,
  type JsonValue,
  type StoryProjectDocument,
} from "../../../../../../../core/story-project";
import { useStoryState } from "../../use-story-state";
import { GenericJsonValueEditor, MetadataFieldEditor } from "./field-editor";

const {
  inspect: inspectStructuredJsonDocument,
  isObject: isJsonObject,
  replaceData: replaceStructuredDocumentData,
  data: storyDocumentData,
  label: storyDocumentLabel,
} = StoryProjectDocuments;

const pointerKey = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);

type EditorSection = {
  description: string;
  fields: [string, JsonFieldMetadata][];
  id: string;
  label: string;
};

const technicalKeyPattern = /^(kind|id|schemaVersion|documentId|createdAt|updatedAt|version)$/i;

const sectionForField = (pointer: string, field: JsonFieldMetadata) => {
  const key = pointerKey(pointer);
  if (
    field.readOnly ||
    field.generated ||
    field.immutable ||
    field.const !== undefined ||
    technicalKeyPattern.test(key)
  ) {
    return "technical";
  }
  if (["object", "collection", "string-list", "reference", "reference-list"].includes(field.type)) {
    return "structured";
  }
  if (["textarea", "content"].includes(field.type)) return "content";
  return "basics";
};

const sectionDefinitions = {
  basics: { label: "基本信息", description: "名称、类型与其他便于快速识别的基本属性。" },
  content: { label: "主要内容", description: "集中维护这份资料最重要的叙事内容。" },
  structured: { label: "列表与关系", description: "维护条目、引用和其他可重复的结构化信息。" },
  technical: { label: "技术信息", description: "文件身份、版本与更新时间等系统维护信息。" },
} as const;

const buildSections = (fields: Record<string, JsonFieldMetadata>): EditorSection[] => {
  const buckets = new Map<string, [string, JsonFieldMetadata][]>();
  for (const entry of Object.entries(fields)) {
    const section = sectionForField(...entry);
    buckets.set(section, [...(buckets.get(section) ?? []), entry]);
  }
  return (["basics", "content", "structured", "technical"] as const).flatMap((id) => {
    const sectionFields = buckets.get(id) ?? [];
    if (sectionFields.length === 0) return [];
    return [{ id, ...sectionDefinitions[id], fields: sectionFields }];
  });
};

const updatedLabel = (updatedAt: number | null) => {
  if (!updatedAt) return "尚未落库";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "已保存";
  return `已保存于 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
};

export const StoryDocumentEditor = ({
  categoryLabel,
  document,
}: {
  categoryLabel: string;
  document: StoryProjectDocument;
}) => {
  const saveDocument = useStoryState((state) => state.saveDocument);
  const deleteDocument = useStoryState((state) => state.deleteDocument);
  const isSaving = useStoryState((state) => state.isSaving);
  const isMarkdown = document.path.endsWith(".md");
  const sourceText = (value: JsonValue) => {
    if (isMarkdown) {
      const data = storyDocumentData({ ...document, value });
      return typeof data?.content === "string" ? data.content : "";
    }
    return JSON.stringify(value, null, 2);
  };
  const canonicalText = useMemo(() => sourceText(document.value), [document.value, isMarkdown]);
  const [rawText, setRawText] = useState(canonicalText);
  const [draft, setDraft] = useState<JsonValue>(document.value);
  const [rawError, setRawError] = useState("");
  const [viewMode, setViewMode] = useState<"form" | "source">("form");
  const [activeSectionId, setActiveSectionId] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  useEffect(() => {
    setDraft(document.value);
    setRawText(sourceText(document.value));
    setRawError("");
  }, [document]);

  const inspected = useMemo(() => inspectStructuredJsonDocument({ ...document, value: draft }), [document, draft]);
  const sections = useMemo(() => (inspected ? buildSections(inspected.fields) : []), [inspected]);
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;
  const isDirty = rawText !== canonicalText;

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  const updateData = (key: string, value: JsonValue) => {
    if (!inspected) return;
    const next = replaceStructuredDocumentData(draft, { ...inspected.data, [key]: value });
    setDraft(next);
    setRawText(sourceText(next));
  };

  const updateFriendlyValue = (value: JsonValue) => {
    const next = inspected && isJsonObject(value) ? replaceStructuredDocumentData(draft, value) : value;
    setDraft(next);
    setRawText(sourceText(next));
  };

  const parseRaw = () => {
    if (isMarkdown) {
      const data = storyDocumentData({ ...document, value: draft });
      const value = { ...(data ?? {}), content: rawText } as JsonValue;
      setDraft(value);
      setRawError("");
      return { valid: true as const, value };
    }
    try {
      const value = JSON.parse(rawText) as JsonValue;
      setDraft(value);
      setRawError("");
      return { valid: true as const, value };
    } catch {
      setRawError("JSON 格式无效，请修正后再保存或返回友好编辑。 ");
      return { valid: false as const };
    }
  };

  const switchToForm = () => {
    const result = parseRaw();
    if (result.valid) setViewMode("form");
  };

  const save = async () => {
    const result = parseRaw();
    if (!result.valid) return;
    const saved = await saveDocument({ ...document, value: result.value });
    if (saved) toast.success("故事资料已保存。 ");
  };

  const remove = async () => {
    if (await deleteDocument(document.path)) {
      setIsDeleteOpen(false);
      toast.success("故事资料已删除。 ");
    }
  };

  const title = inspected?.label ?? storyDocumentLabel(document);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b px-5 py-2.5 xl:px-7">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{categoryLabel}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <CheckCircle2 className={isDirty ? "size-3.5 text-amber-500" : "size-3.5 text-primary"} />
            {isDirty ? "有未保存修改" : updatedLabel(document.updatedAt)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon-sm" variant="outline" aria-label="更多操作">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {viewMode === "form" ? (
                <DropdownMenuItem onSelect={() => setViewMode("source")}>
                  <FileCode2 className="size-4" />
                  查看{isMarkdown ? " Markdown" : " JSON"}源码
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={switchToForm}>
                  <Braces className="size-4" />
                  返回友好编辑
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                <Trash2 className="size-4" />
                删除这份资料
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" size="sm" disabled={isSaving || !isDirty} onClick={() => void save()}>
            <Save className="size-4" />
            {isSaving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>

      {viewMode === "form" && sections.length > 0 ? (
        <div className="flex shrink-0 items-center gap-6 overflow-x-auto border-b px-5 xl:px-7" role="tablist">
          {sections.map((section) => {
            const active = activeSection?.id === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  "relative h-12 shrink-0 text-sm font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                onClick={() => setActiveSectionId(section.id)}
              >
                {section.label}
                {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === "source" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="px-5 pt-5 xl:px-7">
              <h2 className="text-lg font-semibold">{isMarkdown ? "Markdown 正文" : "JSON 源码"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                高级编辑模式 · <span className="font-mono">{document.path}</span>
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-5 xl:px-7">
              <Textarea
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
              {rawError ? <p className="text-xs text-destructive">{rawError}</p> : null}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-5xl px-5 py-6 xl:px-8 xl:py-8">
              {inspected && activeSection ? (
                <section aria-labelledby={`section-${activeSection.id}`}>
                  <div className="mb-2">
                    <h2 id={`section-${activeSection.id}`} className="text-xl font-semibold tracking-tight">
                      {activeSection.label}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeSection.description}</p>
                  </div>
                  <div className="divide-y">
                    {activeSection.fields.map(([pointer, field]) => (
                      <MetadataFieldEditor
                        key={pointer}
                        definitions={inspected.definitions}
                        field={field}
                        value={inspected.data[pointerKey(pointer)]}
                        onChange={(value) => updateData(pointerKey(pointer), value)}
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <section>
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold tracking-tight">内容</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      这份 JSON 没有内嵌字段说明，编辑器会按实际对象结构生成控件。
                    </p>
                  </div>
                  <GenericJsonValueEditor value={inspected?.data ?? draft} onChange={updateFriendlyValue} />
                </section>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{title}”？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 {document.path}。编辑器不会自动修复其他文件中的引用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

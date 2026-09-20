import { useMemo, useRef, useState } from "react";
import {
  Braces,
  CalendarClock,
  Check,
  ChevronRight,
  FileJson2,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
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
} from "design-system/components/ui/alert-dialog";
import { Badge } from "design-system/components/ui/badge";
import { Button } from "design-system/components/ui/button";
import { Markdown } from "design-system/components/markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import type { StoryDocument, StoryValue } from "@story/project/types";
import {
  inspectStoryDocument,
  isJsonObject,
  storyDocumentData,
  storyDocumentKey,
  storyDocumentLabel,
  type JsonFieldMetadata,
  type JsonObjectDefinition,
} from "../../../story-document";
import { useStoryState } from "../../use-story-state";
import { StoryDocumentDialog, type StoryDocumentDialogHandle } from "../dialog";
import { buildDocumentSections, documentPointerKey, updatedDocumentLabel } from "../structure";

const EmptyValue = () => <span className="text-sm text-muted-foreground/75">未填写</span>;

const PrimitiveValue = ({ field, value }: { field: JsonFieldMetadata; value: StoryValue | undefined }) => {
  if (value === undefined || value === null || value === "") return <EmptyValue />;
  if (typeof value === "boolean") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        {value ? <Check className="size-3.5 text-primary" /> : <X className="size-3.5 text-muted-foreground" />}
        {value ? "是" : "否"}
      </span>
    );
  }
  if (field.type === "timestamp" && typeof value === "number") {
    return <p className="text-sm">{new Date(value).toLocaleString("zh-CN", { hour12: false })}</p>;
  }
  const option = typeof value === "string" ? field.options?.find((item) => item.value === value) : undefined;
  return (
    <p
      className={
        field.type === "textarea" || field.type === "content"
          ? "max-w-[78ch] whitespace-pre-wrap text-sm leading-6"
          : "text-sm leading-6"
      }
    >
      {option?.label ?? String(value)}
    </p>
  );
};

const ObjectValue = ({
  definition,
  definitions,
  value,
}: {
  definition: JsonObjectDefinition;
  definitions: Readonly<Record<string, JsonObjectDefinition>>;
  value: StoryValue | undefined;
}) => {
  const object = isJsonObject(value) ? value : {};
  return (
    <dl className="grid gap-x-6 gap-y-4 rounded-xl border bg-surface/45 p-4 sm:grid-cols-2">
      {Object.entries(definition.fields).map(([pointer, field]) => (
        <DocumentField
          key={pointer}
          compact
          definitions={definitions}
          field={field}
          value={object[documentPointerKey(pointer)]}
        />
      ))}
    </dl>
  );
};

const DocumentField = ({
  compact = false,
  definitions,
  field,
  value,
}: {
  compact?: boolean;
  definitions: Readonly<Record<string, JsonObjectDefinition>>;
  field: JsonFieldMetadata;
  value: StoryValue | undefined;
}) => {
  const objectDefinition = field.definition ? definitions[field.definition] : undefined;
  const itemDefinition = field.itemDefinition ? definitions[field.itemDefinition] : undefined;
  const items = Array.isArray(value) ? value : [];
  let content;

  if (objectDefinition) {
    content = <ObjectValue definition={objectDefinition} definitions={definitions} value={value} />;
  } else if (itemDefinition) {
    content =
      items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">第 {index + 1} 项</div>
              <ObjectValue definition={itemDefinition} definitions={definitions} value={item} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyValue />
      );
  } else if (Array.isArray(value)) {
    content =
      value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, index) => (
            <Badge
              key={`${String(item)}-${index}`}
              variant="secondary"
              className="h-auto max-w-full whitespace-normal py-1"
            >
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </Badge>
          ))}
        </div>
      ) : (
        <EmptyValue />
      );
  } else if (isJsonObject(value)) {
    content = (
      <pre className="max-w-full overflow-x-auto rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } else {
    content = <PrimitiveValue field={field} value={value} />;
  }

  const spansFullWidth =
    !compact && ["textarea", "content", "object", "collection", "string-list", "reference-list"].includes(field.type);

  return (
    <div
      className={
        compact
          ? "min-w-0"
          : [
              "min-w-0 rounded-xl border border-border/55 bg-card/75 px-4 py-3",
              spansFullWidth ? "sm:col-span-2" : "",
            ].join(" ")
      }
    >
      <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
      <dd className="mt-1 min-w-0">{content}</dd>
    </div>
  );
};

export const StoryDocumentDetail = ({
  categoryLabel,
  document,
}: {
  categoryLabel: string;
  document: StoryDocument;
}) => {
  const deleteDocument = useStoryState((state) => state.deleteDocument);
  const isSaving = useStoryState((state) => state.isSaving);
  const editDialogRef = useRef<StoryDocumentDialogHandle>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const inspected = useMemo(() => inspectStoryDocument(document), [document]);
  const sections = useMemo(() => (inspected ? buildDocumentSections(inspected.fields) : []), [inspected]);
  const contentSections = sections.filter((section) => section.id !== "technical");
  const technicalSection = sections.find((section) => section.id === "technical") ?? null;
  const content = storyDocumentData(document)?.content;
  const isMarkdown = document.definition?.contentFormat === "markdown";
  const title = storyDocumentLabel(document);
  const canDelete = Object.keys(document.ref.identity).length > 0;

  const remove = async () => {
    if (await deleteDocument(document.ref)) {
      setIsDeleteOpen(false);
      toast.success("故事资料已删除。");
    }
  };

  return (
    <div className="app-canvas flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b bg-surface-raised/80 px-5 py-2.5 backdrop-blur-xl xl:px-7">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{categoryLabel}</span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon-sm" variant="outline" aria-label="更多操作">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  删除这份资料
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button type="button" size="sm" onClick={() => editDialogRef.current?.(document)}>
            <Pencil className="size-4" />
            编辑
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <article className="mx-auto w-full max-w-5xl px-5 py-7 xl:px-8 xl:py-9">
          <div className="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                {isMarkdown ? <FileText className="size-4" /> : <FileJson2 className="size-4" />}
                <span className="text-xs font-medium">{document.definition?.label ?? "故事资料"}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {updatedDocumentLabel(document.updatedAt)}
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <Braces className="size-3" />
              {isMarkdown ? "Markdown" : "结构化文档"}
            </Badge>
          </div>

          {isMarkdown ? (
            typeof content === "string" && content.trim() ? (
              <Markdown content={content} className="text-[15px] leading-7" />
            ) : (
              <div className="app-empty-state rounded-2xl px-6 py-14 text-center">
                <p className="text-sm text-muted-foreground">暂无正文内容，点击“编辑”开始写作。</p>
              </div>
            )
          ) : inspected ? (
            <div className="space-y-9">
              {contentSections.map((section) => (
                <section key={section.id} aria-labelledby={`document-detail-section-${section.id}`}>
                  <div className="mb-4">
                    <h2 id={`document-detail-section-${section.id}`} className="text-base font-semibold">
                      {section.label}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.description}</p>
                  </div>
                  <dl className="grid items-start gap-3 sm:grid-cols-2">
                    {section.fields.map(([pointer, field]) => (
                      <DocumentField
                        key={pointer}
                        definitions={inspected.definitions}
                        field={field}
                        value={inspected.data[documentPointerKey(pointer)]}
                      />
                    ))}
                  </dl>
                </section>
              ))}
              {technicalSection ? (
                <details className="group rounded-xl border bg-card/65 px-4">
                  <summary className="cursor-pointer list-none py-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    技术信息
                    <span className="ml-2 text-xs font-normal opacity-70">文档标识与系统维护字段</span>
                  </summary>
                  <dl className="grid items-start gap-3 border-t py-4 sm:grid-cols-2">
                    {technicalSection.fields.map(([pointer, field]) => (
                      <DocumentField
                        key={pointer}
                        definitions={inspected.definitions}
                        field={field}
                        value={inspected.data[documentPointerKey(pointer)]}
                      />
                    ))}
                  </dl>
                </details>
              ) : null}
            </div>
          ) : (
            <pre className="max-w-full overflow-x-auto rounded-xl border bg-card/75 p-4 font-mono text-xs leading-5">
              {JSON.stringify(document.value, null, 2)}
            </pre>
          )}
        </article>
      </ScrollArea>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{title}”？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 {storyDocumentKey(document)}，其他资料中的引用不会自动修复。
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
              {isSaving ? "删除中" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StoryDocumentDialog bind={editDialogRef} />
    </div>
  );
};

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  BookOpenText,
  ChevronRight,
  FileJson2,
  FileText,
  GitBranch,
  Globe2,
  ListTree,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "design-system/components/ui/collapsible";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import type { StoryDocument } from "@story/project/types";
import { inspectStoryDocument, storyDocumentKey, storyDocumentLabel } from "../../story-document";
import { useStoryState } from "../use-story-state";
import { StoryDocumentDetail } from "./detail";
import { StoryDocumentDialog, type StoryDocumentDialogHandle } from "./dialog";

type DocumentGroup = {
  icon: ComponentType<{ className?: string }>;
  id: string;
  label: string;
  documents: StoryDocument[];
};

const groupHints = [
  {
    id: "people",
    label: "人物与关系",
    icon: UsersRound,
    keywords: ["character", "relationship", "角色", "人物", "关系"],
  },
  {
    id: "world",
    label: "世界设定",
    icon: Globe2,
    keywords: ["world", "setting", "faction", "location", "世界", "设定", "势力", "地点"],
  },
  {
    id: "outline",
    label: "大纲与卷纲",
    icon: BookOpenText,
    keywords: ["outline", "volume", "book-arc", "arc", "大纲", "卷纲", "分卷", "主线"],
  },
  {
    id: "chapter-plan",
    label: "细纲",
    icon: ListTree,
    keywords: ["chapter-plan", "chapter-outline", "细纲"],
  },
  {
    id: "chapter-content",
    label: "正文",
    icon: FileText,
    keywords: ["chapter-content", "章节正文", "正文"],
  },
  {
    id: "continuity",
    label: "伏笔与连续性",
    icon: GitBranch,
    keywords: [
      "tracking",
      "chapter-result",
      "foreshadow",
      "continuity",
      "progress",
      "章节结果",
      "章节记录",
      "伏笔",
      "连续",
      "进度",
    ],
  },
] as const;

const exactGroupIdsByKind: Readonly<Record<string, string>> = {
  "story-book-arc": "outline",
  "story-volume": "outline",
  "story-chapter-plan": "chapter-plan",
  "story-chapter-content": "chapter-content",
  "story-chapter": "continuity",
};

const documentSearchText = (document: StoryDocument) => {
  const inspected = inspectStoryDocument(document);
  return `${storyDocumentKey(document)} ${inspected?.kind ?? ""} ${inspected?.label ?? ""} ${storyDocumentLabel(document)}`.toLowerCase();
};

export const groupForDocument = (document: StoryDocument) => {
  const exactGroupId = exactGroupIdsByKind[document.ref.kind];
  const exactGroup = exactGroupId ? groupHints.find((group) => group.id === exactGroupId) : null;
  if (exactGroup) return exactGroup;

  const searchable = documentSearchText(document);
  return (
    groupHints.find((group) => group.keywords.some((keyword) => searchable.includes(keyword))) ?? {
      id: "work",
      label: "作品",
      icon: BookOpenText,
      keywords: [],
    }
  );
};

export const buildDocumentGroups = (documents: StoryDocument[], query: string): DocumentGroup[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? documents.filter((document) => documentSearchText(document).includes(normalizedQuery))
    : documents;
  const groups = new Map<string, DocumentGroup>();
  for (const document of visible) {
    const group = groupForDocument(document);
    const current: DocumentGroup = groups.get(group.id) ?? {
      icon: group.icon,
      id: group.id,
      label: group.label,
      documents: [],
    };
    current.documents.push(document);
    groups.set(group.id, current);
  }
  const order = ["work", "people", "world", "outline", "chapter-plan", "chapter-content", "continuity"];
  return [...groups.values()].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
};

export const StoryModules = () => {
  const documents = useStoryState((state) => state.documents);
  const createDialogRef = useRef<StoryDocumentDialogHandle>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(["chapter-plan", "chapter-content"]),
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSelectedKey((current) =>
      documents.some((document) => storyDocumentKey(document) === current)
        ? current
        : documents[0]
          ? storyDocumentKey(documents[0])
          : "",
    );
  }, [documents]);

  const selected = documents.find((document) => storyDocumentKey(document) === selectedKey) ?? null;
  const groups = useMemo(() => buildDocumentGroups(documents, query), [documents, query]);
  const selectedGroup = selected ? groupForDocument(selected) : null;
  const openCreateDialog = () => createDialogRef.current?.();
  const setGroupOpen = (groupId: string, open: boolean) => {
    setCollapsedGroupIds((current) => {
      const isOpen = !current.has(groupId);
      if (isOpen === open) return current;

      const next = new Set(current);
      if (open) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const handleDocumentSaved = (saved: StoryDocument) => {
    setSelectedKey(storyDocumentKey(saved));
    setGroupOpen(groupForDocument(saved).id, true);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[15.5rem_minmax(0,1fr)] overflow-hidden bg-background xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-surface/65">
        <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">故事资料</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">按内容组织，而不是按文件浏览</p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="新增故事资料"
            aria-label="新增故事资料"
            onClick={openCreateDialog}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              className="h-9 bg-background pl-8 text-sm shadow-none"
              placeholder="搜索资料"
              aria-label="搜索故事资料"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-1 px-3 pb-5" aria-label="故事资料导航">
            {groups.map((group) => {
              const GroupIcon = group.icon;
              const isOpen = !collapsedGroupIds.has(group.id);
              const containsSelectedDocument = selectedGroup?.id === group.id;
              return (
                <Collapsible key={group.id} open={isOpen} onOpenChange={(open) => setGroupOpen(group.id, open)}>
                  <section>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className={[
                          "flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                          containsSelectedDocument
                            ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/15"
                            : "hover:bg-muted/55",
                        ].join(" ")}
                      >
                        <ChevronRight
                          className={[
                            "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                            isOpen ? "rotate-90" : "",
                          ].join(" ")}
                        />
                        <GroupIcon className="size-4 shrink-0 text-primary/80" />
                        <span className="min-w-0 truncate">{group.label}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-inset ring-border/70">
                          {group.documents.length}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="relative ml-4 space-y-0.5 border-l border-border/70 pt-0.5 pb-2 pl-2">
                      {group.documents.map((document) => {
                        const key = storyDocumentKey(document);
                        const active = selectedKey === key;
                        const DocumentIcon = document.definition?.contentFormat === "markdown" ? FileText : FileJson2;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={`${storyDocumentLabel(document)} · ${document.definition?.label ?? key}`}
                            aria-current={active ? "page" : undefined}
                            className={[
                              "group flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-5 transition-colors",
                              active
                                ? "bg-primary/10 font-medium text-primary ring-1 ring-inset ring-primary/20"
                                : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                            ].join(" ")}
                            onClick={() => setSelectedKey(key)}
                          >
                            <DocumentIcon className="size-3.5 shrink-0 opacity-65" />
                            <span className="min-w-0 truncate">{storyDocumentLabel(document)}</span>
                            {active ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                          </button>
                        );
                      })}
                    </CollapsibleContent>
                  </section>
                </Collapsible>
              );
            })}
            {query && groups.length === 0 ? (
              <div className="app-empty-state mx-1 rounded-xl px-3 py-8 text-center text-xs leading-5 text-muted-foreground">
                没有匹配的故事资料
              </div>
            ) : null}
          </nav>
        </ScrollArea>
      </aside>
      {selected ? (
        <StoryDocumentDetail
          key={storyDocumentKey(selected)}
          categoryLabel={selectedGroup?.label ?? "故事资料"}
          document={selected}
        />
      ) : (
        <div className="app-canvas flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="app-empty-state max-w-md rounded-2xl px-8 py-10 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileJson2 className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold">暂无故事资料</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              从当前故事支持的标准文档中选择类型，或打开创作助手生成资料与章节正文。
            </p>
            <Button type="button" className="mt-4" onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增资料
            </Button>
          </div>
        </div>
      )}
      <StoryDocumentDialog bind={createDialogRef} onSaved={handleDocumentSaved} />
    </div>
  );
};

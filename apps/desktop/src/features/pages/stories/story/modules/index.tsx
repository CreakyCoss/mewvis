import { useEffect, useMemo, useState, type ComponentType } from "react";
import { BookOpenText, FileJson2, FileText, GitBranch, Globe2, ListTree, Plus, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryDocument } from "../../../../../../core/story-project/types";
import { inspectStoryDocument, storyDocumentKey, storyDocumentLabel } from "../../story-document";
import { useStoryState } from "../use-story-state";
import { CreateJsonDocumentDialog } from "./documents/create-dialog";
import { StoryDocumentEditor } from "./documents/document-editor";

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
    label: "大纲与章节",
    icon: ListTree,
    keywords: ["outline", "chapter", "volume", "arc", "大纲", "章节", "分卷", "主线"],
  },
  {
    id: "continuity",
    label: "伏笔与连续性",
    icon: GitBranch,
    keywords: ["tracking", "foreshadow", "continuity", "progress", "伏笔", "连续", "进度"],
  },
] as const;

const documentSearchText = (document: StoryDocument) => {
  const inspected = inspectStoryDocument(document);
  return `${storyDocumentKey(document)} ${inspected?.kind ?? ""} ${inspected?.label ?? storyDocumentLabel(document)}`.toLowerCase();
};

const groupForDocument = (document: StoryDocument) => {
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

const buildDocumentGroups = (documents: StoryDocument[], query: string): DocumentGroup[] => {
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
  const order = ["work", "people", "world", "outline", "continuity"];
  return [...groups.values()].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
};

export const StoryModules = () => {
  const documents = useStoryState((state) => state.documents);
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden bg-background xl:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-sidebar/55">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-semibold">故事资料</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">按内容组织，而不是按文件浏览</p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="新增 JSON 文档"
            aria-label="新增 JSON 文档"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              className="h-8 bg-background pl-8 text-xs shadow-none"
              placeholder="搜索资料"
              aria-label="搜索故事资料"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-5 px-3 pb-5" aria-label="故事资料导航">
            {groups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <section key={group.id}>
                  <div className="mb-1.5 flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground">
                    <GroupIcon className="size-3.5" />
                    <span>{group.label}</span>
                    <span className="ml-auto tabular-nums opacity-70">{group.documents.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.documents.map((document) => {
                      const key = storyDocumentKey(document);
                      const active = selectedKey === key;
                      const DocumentIcon = document.definition?.contentFormat === "markdown" ? FileText : FileJson2;
                      return (
                        <button
                          key={key}
                          type="button"
                          title={key}
                          aria-current={active ? "page" : undefined}
                          className={[
                            "group flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                            active
                              ? "bg-primary/10 font-medium text-primary ring-1 ring-inset ring-primary/20"
                              : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                          ].join(" ")}
                          onClick={() => setSelectedKey(key)}
                        >
                          <DocumentIcon className="size-4 shrink-0 opacity-80" />
                          <span className="min-w-0 truncate">{storyDocumentLabel(document)}</span>
                          {active ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {query && groups.length === 0 ? (
              <div className="px-2 py-10 text-center text-xs leading-5 text-muted-foreground">没有匹配的故事资料</div>
            ) : null}
          </nav>
        </ScrollArea>
      </aside>
      {selected ? (
        <StoryDocumentEditor
          key={storyDocumentKey(selected)}
          categoryLabel={selectedGroup?.label ?? "故事资料"}
          document={selected}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <FileJson2 className="mx-auto size-9 text-muted-foreground" />
            <h3 className="mt-3 text-base font-semibold">暂无故事资料</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              可以手动创建 JSON，或打开创作助手生成当前故事类型管理的资料与章节 Markdown。
            </p>
            <Button type="button" className="mt-4" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" />
              新增 JSON
            </Button>
          </div>
        </div>
      )}
      <CreateJsonDocumentDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
};

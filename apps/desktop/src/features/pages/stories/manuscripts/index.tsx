import { ArrowLeft, Check, FileText, GitBranch, Loader2, Pencil, Plus, ScrollText, X } from "lucide-react";
import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryLibraryItem } from "../storage";
import {
  EmptyBlock,
  editorIconActionButtonClassName,
  editorDangerIconActionButtonClassName,
} from "../components/story-primitives";
import { groupStoryManuscriptsByNode, manuscriptSourceLabels, manuscriptStatusLabels } from "./model/operations";
import type { StoryManuscript } from "./model/types";
import { StoryManuscriptEdit, type StoryManuscriptEditHandle } from "./components/manuscript-edit";
import { useStoryManuscripts } from "./hooks/use-story-manuscripts";

export type StoryManuscriptsHandle = {
  close: () => void;
  open: (item: StoryLibraryItem) => void;
};

type StoryManuscriptsPageProps = {
  bind: Ref<StoryManuscriptsHandle>;
  onBack: () => void;
  onOpenStoryEditor: (item: StoryLibraryItem) => void;
};

const manuscriptGroupTabs = [
  { status: "pending", label: "未收稿", icon: FileText },
  { status: "accepted", label: "已收稿", icon: ScrollText },
  { status: "rejected", label: "已退回", icon: X },
] as const;

export const StoryManuscriptsPage = ({ bind, onBack, onOpenStoryEditor }: StoryManuscriptsPageProps) => {
  const [item, setItem] = useState<StoryLibraryItem | null>(null);

  const close = useCallback(() => {
    setItem(null);
  }, []);

  const open = useCallback((nextItem: StoryLibraryItem) => {
    setItem(nextItem);
  }, []);

  const handleBack = () => {
    close();
    onBack();
  };

  useImperativeHandle(bind, () => ({ close, open }), [close, open]);

  if (!item) {
    return null;
  }

  return (
    <StoryManuscriptsContent
      key={item.id}
      item={item}
      onBack={handleBack}
      onOpenStoryEditor={() => onOpenStoryEditor(item)}
    />
  );
};

const StoryManuscriptsContent = ({
  item,
  onBack,
  onOpenStoryEditor,
}: {
  item: StoryLibraryItem;
  onBack: () => void;
  onOpenStoryEditor: () => void;
}) => {
  const { story, workspace } = item;
  const editRef = useRef<StoryManuscriptEditHandle>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(story.graph.activeNodeId || story.graph.entryNodeId || "");
  const manuscriptActions = useStoryManuscripts({ story, workspace });
  const groupedManuscripts = useMemo(
    () => groupStoryManuscriptsByNode(story, manuscriptActions.manuscripts),
    [manuscriptActions.manuscripts, story],
  );
  const selectedNode = story.graph.nodes.find((node) => node.id === selectedNodeId) ?? story.graph.nodes[0] ?? null;
  const selectedGroup = selectedNode ? groupedManuscripts[selectedNode.id] : null;
  const pendingCount = manuscriptActions.manuscripts.filter((manuscript) => manuscript.status === "pending").length;

  useEffect(() => {
    setSelectedNodeId(story.graph.activeNodeId || story.graph.entryNodeId || story.graph.nodes[0]?.id || "");
  }, [story.graph.activeNodeId, story.graph.entryNodeId, story.graph.nodes]);

  return (
    <div className="absolute inset-0 z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background px-5 py-4 shadow-sm lg:px-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              title="返回故事入口"
              aria-label="返回故事入口"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/35 text-primary">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold leading-7">{story.title} · 稿件</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{story.graph.nodes.length} 节点</Badge>
                <Badge variant={pendingCount > 0 ? "default" : "outline"}>{pendingCount} 未收稿</Badge>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={onOpenStoryEditor}>
              <Pencil className="size-4" />
              编辑故事
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              disabled={!selectedNode}
              onClick={() => editRef.current?.create(selectedNode?.id)}
            >
              <Plus className="size-4" />
              手写稿件
            </Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-muted/10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-h-0 border-r bg-background/70">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-3">
              {story.graph.nodes.map((node) => {
                const group = groupedManuscripts[node.id];
                const isSelected = node.id === selectedNode?.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={[
                      "flex w-full min-w-0 flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      isSelected ? "border-primary/35 bg-primary/10 text-primary" : "bg-background",
                    ].join(" ")}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch className="size-4 shrink-0" />
                      <span className="truncate text-sm font-medium">{node.title}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={group?.pending.length ? "default" : "outline"}>
                        {group?.pending.length ?? 0} 未
                      </Badge>
                      <Badge variant="outline">{group?.accepted.length ?? 0} 收</Badge>
                      <Badge variant="outline">{group?.rejected.length ?? 0} 退</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <ScrollArea className="min-h-0">
          <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
            {selectedNode ? (
              <>
                <section className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold leading-7">{selectedNode.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">节点：{selectedNode.id}</Badge>
                        {selectedNode.sceneId ? <Badge variant="outline">场景：{selectedNode.sceneId}</Badge> : null}
                      </div>
                    </div>
                    {manuscriptActions.isLoading ? (
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        加载中
                      </div>
                    ) : null}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-3">
                  {manuscriptGroupTabs.map(({ status, label, icon: Icon }) => (
                    <section key={status} className="min-w-0 rounded-lg border bg-background">
                      <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-primary" />
                          <h3 className="truncate text-sm font-semibold">{label}</h3>
                        </div>
                        <Badge variant={status === "pending" ? "default" : "outline"}>
                          {selectedGroup?.[status].length ?? 0}
                        </Badge>
                      </div>
                      <div className="space-y-2 p-3">
                        {selectedGroup?.[status].length ? (
                          selectedGroup[status].map((manuscript) => (
                            <StoryManuscriptListItem
                              key={manuscript.id}
                              manuscript={manuscript}
                              onAccept={() => void manuscriptActions.acceptManuscript(manuscript.id)}
                              onEdit={() => editRef.current?.edit(manuscript)}
                              onReject={() => void manuscriptActions.rejectManuscript(manuscript.id)}
                            />
                          ))
                        ) : (
                          <EmptyBlock text={`暂无${manuscriptStatusLabels[status]}件`} />
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <EmptyBlock text="暂无剧情节点" />
            )}
          </main>
        </ScrollArea>
      </div>

      <StoryManuscriptEdit
        bind={editRef}
        story={story}
        onAccept={manuscriptActions.acceptManuscript}
        onCreate={manuscriptActions.createManuscriptDraft}
        onPolish={manuscriptActions.polishManuscriptDraft}
        onSave={manuscriptActions.saveManuscriptDraft}
        onReject={manuscriptActions.rejectManuscript}
      />
    </div>
  );
};

const StoryManuscriptListItem = ({
  manuscript,
  onAccept,
  onEdit,
  onReject,
}: {
  manuscript: StoryManuscript;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
}) => (
  <div className="rounded-md border bg-background/90 p-3">
    <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
      <button type="button" className="min-w-0 text-left" onClick={onEdit}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="truncate text-sm font-semibold leading-5">{manuscript.title}</div>
          <Badge variant="secondary">{manuscriptSourceLabels[manuscript.source]}</Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{new Date(manuscript.updatedAt).toLocaleString()}</div>
      </button>
      {manuscript.status === "pending" ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className={editorIconActionButtonClassName}
            onClick={onAccept}
            title="收稿"
            aria-label="收稿"
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className={editorDangerIconActionButtonClassName}
            onClick={onReject}
            title="退回"
            aria-label="退回"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
    <div className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
      {manuscript.summary || manuscript.content}
    </div>
  </div>
);

export default StoryManuscriptsPage;

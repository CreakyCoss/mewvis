import { GitBranch, MessageSquareText, Pencil, Wine } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { EmptyBlock, StorySection } from "../../shared";
import type { StoryModuleSave } from "../types";
import { StoryGraphEdit, type StoryGraphEditHandle } from "./edit";

type StoryGraphModuleProps = {
  story: StoryAsset;
  onSave: StoryModuleSave;
  onOpenNodeTavern?: (nodeId: string) => void;
  onOpenNodeChat?: (nodeId: string) => void;
};

export const StoryGraphModule = ({
  story,
  onSave,
  onOpenNodeTavern,
  onOpenNodeChat,
}: StoryGraphModuleProps) => {
  const editRef = useRef<StoryGraphEditHandle>(null);

  const activeNode = story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
    story.graph.nodes[0];

  return (
    <>
      <StorySection
        icon={GitBranch}
        title="故事结构"
        description="维护阶段、节点和分支，为不同呈现方式提供统一结构。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => editRef.current?.(story)}
          >
            <Pencil className="size-4" />
            编辑
          </Button>
        )}
      >
        {story.graph.nodes.length === 0 ? (
          <EmptyBlock text="暂无节点" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{story.graph.stages.length} 阶段</Badge>
              <Badge variant="outline">{story.graph.nodes.length} 节点</Badge>
              <Badge variant="outline">{story.graph.edges.length} 分支</Badge>
              {activeNode ? <Badge variant="secondary">当前：{activeNode.title}</Badge> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {story.graph.nodes.slice(0, 8).map((node) => (
                <div key={node.id} className="rounded-md border px-3 py-2">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{node.title}</div>
                      {story.graph.entryNodeId === node.id ? <Badge variant="outline">入口</Badge> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {onOpenNodeTavern ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => onOpenNodeTavern(node.id)}
                          title="进入酒馆"
                          aria-label="进入酒馆"
                        >
                          <Wine className="size-4" />
                        </Button>
                      ) : null}
                      {onOpenNodeChat ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => onOpenNodeChat(node.id)}
                          title="进入聊天梳理"
                          aria-label="进入聊天梳理"
                        >
                          <MessageSquareText className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {node.type} · {node.pathRole} · {node.status || "draft"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </StorySection>

      <StoryGraphEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};

import { useEffect, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import { convertStorySourceToStoryJson, parseStoryJsonFromText } from "./converter";
import { normalizeStoryJson } from "../../model/normalizer";
import type { StoryJson } from "../../model/types";
import { EditorField, EmptyBlock } from "../../../components/story-primitives";

type StoryImportDialogProps = {
  open: boolean;
  originalStory: StoryJson | null;
  onOpenChange: (open: boolean) => void;
  onSaveStory: (story: StoryJson) => Promise<unknown> | unknown;
};

const dedupeById = <T extends { id: string }>(items: T[]) => [
  ...new Map(items.map((item) => [item.id, item] as const)).values(),
];

const mergeStoryJsonIntoStory = (story: StoryJson, incoming: StoryJson): StoryJson => ({
  ...story,
  title: incoming.title.trim() || story.title,
  outline: incoming.outline.trim() || story.outline,
  goal: incoming.goal.trim() || story.goal,
  userPersonaName: incoming.userPersonaName.trim() || story.userPersonaName,
  characters: dedupeById([...story.characters, ...incoming.characters]),
  lorebookEntries: dedupeById([...story.lorebookEntries, ...incoming.lorebookEntries]),
  scenes: dedupeById([...story.scenes, ...incoming.scenes]),
  graph: {
    entryNodeId: story.graph.entryNodeId || incoming.graph.entryNodeId,
    activeNodeId: story.graph.activeNodeId || incoming.graph.activeNodeId,
    stages: dedupeById([...story.graph.stages, ...incoming.graph.stages]),
    nodes: dedupeById([...story.graph.nodes, ...incoming.graph.nodes]),
    edges: dedupeById([...story.graph.edges, ...incoming.graph.edges]),
  },
  updatedAt: Date.now(),
});

const createOverwriteStory = (originalStory: StoryJson, importStory: StoryJson): StoryJson =>
  ({
    ...(normalizeStoryJson(importStory, {
      id: originalStory.id,
      workspaceId: originalStory.workspaceId,
      timestamp: Date.now(),
    }) ?? importStory),
    id: originalStory.id,
    workspaceId: originalStory.workspaceId,
    createdAt: originalStory.createdAt,
    updatedAt: Date.now(),
  }) satisfies StoryJson;

type StoryImportSourcePanelProps = {
  importRaw: string;
  isConverting: boolean;
  onConvert: () => void;
  setImportRaw: (raw: string) => void;
  setImportStory: (story: StoryJson | null) => void;
};

const StoryImportSourcePanel = ({
  importRaw,
  isConverting,
  onConvert,
  setImportRaw,
  setImportStory,
}: StoryImportSourcePanelProps) => (
  <div className="min-h-0 space-y-3">
    <EditorField label="文件">
      <Input
        type="file"
        accept="application/json,text/plain,.json,.txt,.md"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          file
            .text()
            .then((content) => {
              setImportRaw(content);
              setImportStory(parseStoryJsonFromText(content));
            })
            .catch((error) => {
              console.error("Failed to read story import file", error);
              toast.error("无法读取导入文件。");
            })
            .finally(() => {
              event.target.value = "";
            });
        }}
      />
    </EditorField>
    <EditorField label="原始内容">
      <Textarea
        className="min-h-72 resize-y font-mono text-xs"
        value={importRaw}
        onChange={(event) => {
          setImportRaw(event.target.value);
          setImportStory(parseStoryJsonFromText(event.target.value));
        }}
      />
    </EditorField>
    <Button type="button" className="w-full gap-2" onClick={onConvert} disabled={isConverting || !importRaw.trim()}>
      {isConverting ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
      {isConverting ? "转换中" : "转换为 story.json"}
    </Button>
  </div>
);

const StoryJsonImportReview = ({ story }: { story: StoryJson | null }) => (
  <ScrollArea className="min-h-0 w-full rounded-md border bg-background lg:flex-1">
    <div className="space-y-4 p-4">
      {!story ? (
        <EmptyBlock text="转换后会在这里预览 story.json" />
      ) : (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">标题</div>
              <div className="mt-1 font-medium">{story.title}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">结构</div>
              <div className="mt-1 font-medium">
                {story.characters.length} 角色 / {story.scenes.length} 场景 / {story.graph.nodes.length} 节点
              </div>
            </div>
          </div>
          <pre className="max-h-[34rem] overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-5">
            {JSON.stringify(story, null, 2)}
          </pre>
        </>
      )}
    </div>
  </ScrollArea>
);

export const StoryImportDialog = ({ open, originalStory, onOpenChange, onSaveStory }: StoryImportDialogProps) => {
  const { selectedRuntimeModel, settingsError } = useRuntimeAgentSettings();
  const [importRaw, setImportRaw] = useState("");
  const [importStory, setImportStory] = useState<StoryJson | null>(null);
  const [isConvertingImport, setIsConvertingImport] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setImportRaw("");
    setImportStory(null);
    setIsConvertingImport(false);
    setIsSavingImport(false);
  }, [open]);

  const requireImportRuntimeModel = () => {
    if (settingsError) {
      throw new Error(settingsError);
    }
    if (!selectedRuntimeModel) {
      throw new Error("非标准来源需要先在设置中选择模型，再由 AI 转换为标准 story.json。");
    }
    return requireRuntimeModelInput(selectedRuntimeModel);
  };

  const convertImportStory = async () => {
    if (!importRaw.trim()) {
      toast.error("请先粘贴或选择要导入的内容。");
      return;
    }

    setIsConvertingImport(true);
    try {
      const parsed = parseStoryJsonFromText(importRaw);
      const story =
        parsed ??
        (await convertStorySourceToStoryJson({
          source: importRaw,
          runtimeModel: requireImportRuntimeModel(),
        }));
      setImportStory(story);
      toast.success(parsed ? "已读取标准 story.json。" : "AI 已转换为标准 story.json。");
    } catch (error) {
      console.error("Failed to convert story import", error);
      toast.error(error instanceof Error ? error.message : "导入转换失败。");
    } finally {
      setIsConvertingImport(false);
    }
  };

  const saveImportedStory = async (mode: "overwrite" | "merge") => {
    if (!originalStory || !importStory) {
      return;
    }

    const nextStory =
      mode === "overwrite"
        ? createOverwriteStory(originalStory, importStory)
        : mergeStoryJsonIntoStory(originalStory, importStory);

    setIsSavingImport(true);
    try {
      const result = await onSaveStory(nextStory);
      if (result === null) {
        return;
      }
      onOpenChange(false);
      toast.success(mode === "overwrite" ? "故事已覆盖。" : "导入内容已合并。");
    } catch (error) {
      console.error("Failed to save imported story", error);
      toast.error(error instanceof Error ? error.message : "故事导入失败。");
    } finally {
      setIsSavingImport(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex h-[min(90vh,52rem)] max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>导入故事</DialogTitle>
          <DialogDescription>标准 JSON 会直接读取；非标准来源会由 AI 转换为 story.json。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:overflow-hidden">
          <div className="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
              <StoryImportSourcePanel
                importRaw={importRaw}
                isConverting={isConvertingImport}
                onConvert={() => void convertImportStory()}
                setImportRaw={setImportRaw}
                setImportStory={setImportStory}
              />
            </div>
            <div className="min-h-0 lg:flex">
              <StoryJsonImportReview story={importStory} />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveImportedStory("merge")}
            disabled={isConvertingImport || isSavingImport || !importStory || !originalStory}
          >
            合并到当前故事
          </Button>
          <Button
            type="button"
            onClick={() => void saveImportedStory("overwrite")}
            disabled={isConvertingImport || isSavingImport || !importStory || !originalStory}
          >
            覆盖当前故事
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

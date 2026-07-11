import { useEffect, useState } from "react";
import { Braces, FileJson, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { storyDocumentLabel } from "../../documents/model";
import { useStoryState } from "../use-story-state";
import { CreateJsonDocumentDialog } from "./documents/create-dialog";
import { StoryDocumentEditor } from "./documents/document-editor";

export const StoryModules = () => {
  const documents = useStoryState((state) => state.documents);
  const [selectedPath, setSelectedPath] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    setSelectedPath((current) =>
      documents.some((document) => document.path === current) ? current : (documents[0]?.path ?? ""),
    );
  }, [documents]);

  const selected = documents.find((document) => document.path === selectedPath) ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[17rem_minmax(0,1fr)] overflow-hidden bg-muted/10">
      <aside className="flex min-h-0 flex-col border-r bg-background/80">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Braces className="size-4 text-primary" />
            JSON 文档
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="新增 JSON"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1.5 p-2">
            {documents.map((document) => (
              <button
                key={document.path}
                type="button"
                className={[
                  "flex w-full min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/50",
                  selectedPath === document.path ? "border-primary/35 bg-primary/10" : "bg-background",
                ].join(" ")}
                onClick={() => setSelectedPath(document.path)}
              >
                <FileJson className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{storyDocumentLabel(document)}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                    {document.path}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
      {selected ? (
        <StoryDocumentEditor key={selected.path} document={selected} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <FileJson className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-3 text-base font-semibold">暂无故事 JSON</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              可以手动创建任意 JSON，或打开创作助手，让内置故事技能生成带字段描述的结构化文档。
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

import { BookOpenText, Loader2, Settings2, Wine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { cn } from "design-system/lib/utils";
import type { TavernChapterOption } from "../../../tavern/room/story-project";

type StoryTavernSelectDialogProps = {
  chapterOptions: TavernChapterOption[];
  isLoading: boolean;
  onConfirm: (chapterId: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  open: boolean;
};

export const StoryTavernSelectDialog = ({
  chapterOptions,
  isLoading,
  onConfirm,
  onOpenChange,
  onOpenSettings,
  open,
}: StoryTavernSelectDialogProps) => {
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const selectedOption = useMemo(
    () => chapterOptions.find((option) => option.id === selectedChapterId) ?? null,
    [chapterOptions, selectedChapterId],
  );

  useEffect(() => {
    if (open) {
      setSelectedChapterId("");
    }
  }, [open]);

  const confirm = async () => {
    if (!selectedChapterId) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm(selectedChapterId);
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[min(88vh,38rem)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0 pr-10">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>进入酒馆</DialogTitle>
            {onOpenSettings && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-muted-foreground"
                aria-label="酒馆设置"
                onClick={onOpenSettings}
              >
                <Settings2 className="size-4" />
                设置
              </Button>
            )}
          </div>
          <DialogDescription>选择要演绎的章节；酒馆会读取与章节写作相同的结构化上下文。</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wine className="size-4 text-primary" />
              故事章节
            </div>
            {selectedOption?.meta ? (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {selectedOption.meta}
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {isLoading ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  正在读取章节
                </div>
              ) : chapterOptions.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  暂无章节细纲
                </div>
              ) : (
                chapterOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition-colors",
                      "hover:border-primary/30 hover:bg-primary/[0.04]",
                      option.id === selectedChapterId ? "border-primary/50 bg-primary/[0.06]" : "bg-background",
                    )}
                    onClick={() => setSelectedChapterId(option.id)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/35 text-primary">
                      <BookOpenText className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="truncate text-sm font-semibold">{option.label}</span>
                      {option.description ? (
                        <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={isLoading || !selectedChapterId || isConfirming}
          >
            {isConfirming ? "进入中" : "进入酒馆"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

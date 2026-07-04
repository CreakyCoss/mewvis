import { MapPin, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { StoryNodeSelectOption } from "../node";

type StoryChatSelectDialogProps = {
  initialNodeId?: string | null;
  nodeOptions: StoryNodeSelectOption[];
  onConfirm: (nodeId: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const StoryChatSelectDialog = ({
  initialNodeId,
  nodeOptions,
  onConfirm,
  onOpenChange,
  open,
}: StoryChatSelectDialogProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const selectedOption = useMemo(
    () => nodeOptions.find((option) => option.id === selectedNodeId) ?? null,
    [nodeOptions, selectedNodeId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedNodeId(
      initialNodeId && nodeOptions.some((option) => option.id === initialNodeId)
        ? initialNodeId
        : (nodeOptions[0]?.id ?? ""),
    );
  }, [initialNodeId, nodeOptions, open]);

  const confirm = async () => {
    if (!selectedNodeId) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm(selectedNodeId);
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[min(88vh,38rem)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>进入聊天</DialogTitle>
          <DialogDescription>选择要作为聊天上下文的故事节点。</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="size-4 text-primary" />
              故事节点
            </div>
            {selectedOption?.meta ? (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                {selectedOption.meta}
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {nodeOptions.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  暂无可用节点
                </div>
              ) : (
                nodeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition-colors",
                      "hover:border-primary/30 hover:bg-primary/[0.04]",
                      option.id === selectedNodeId ? "border-primary/50 bg-primary/[0.06]" : "bg-background",
                    )}
                    onClick={() => setSelectedNodeId(option.id)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/35 text-primary">
                      <MapPin className="size-4" />
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
          <Button type="button" onClick={() => void confirm()} disabled={!selectedNodeId || isConfirming}>
            {isConfirming ? "进入中" : "进入聊天"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

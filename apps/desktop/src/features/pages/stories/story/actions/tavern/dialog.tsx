import { Loader2, MapPin, Wine } from "lucide-react";
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
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { loadTavernState } from "@/features/pages/taverns/storage";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { compactScene } from "@/features/pages/taverns/tavern/utils";
import { cn } from "@/lib/utils";
import type { StoryNodeSelectOption } from "../node";

type StoryTavernSelectDialogProps = {
  initialNodeId?: string | null;
  nodeOptions: StoryNodeSelectOption[];
  onConfirm: (input: { nodeId: string; tavernRoom: TavernRoom }) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const StoryTavernSelectDialog = ({
  initialNodeId,
  nodeOptions,
  onConfirm,
  onOpenChange,
  open,
}: StoryTavernSelectDialogProps) => {
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const carrierWorkspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const [rooms, setRooms] = useState<TavernRoom[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;

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

  useEffect(() => {
    if (!open || !carrierWorkspace) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setRooms([]);
    setSelectedRoomId("");

    loadTavernState(carrierWorkspace.path, carrierWorkspace.id)
      .then((state) => {
        if (isCancelled) {
          return;
        }
        setRooms(state.rooms);
        setSelectedRoomId(state.rooms[0]?.id ?? "");
      })
      .catch((error) => {
        console.error("Failed to load tavern rooms for story carrier", error);
        if (!isCancelled) {
          setRooms([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [carrierWorkspace, open]);

  const confirm = async () => {
    if (!selectedNodeId || !selectedRoom) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm({
        nodeId: selectedNodeId,
        tavernRoom: selectedRoom,
      });
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[min(88vh,42rem)] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>进入酒馆</DialogTitle>
          <DialogDescription>选择故事节点和承载酒馆后进入故事运行目录。</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <SelectPanel
            emptyText="暂无可用节点"
            options={nodeOptions}
            selectedId={selectedNodeId}
            title="故事节点"
            onSelect={setSelectedNodeId}
          />

          <ScrollArea className="min-h-0 rounded-md border bg-background">
            <div className="space-y-2 p-3">
              {isLoading ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在读取酒馆
                </div>
              ) : rooms.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  暂无可用酒馆
                </div>
              ) : (
                rooms.map((room) => {
                  const isSelected = room.id === selectedRoom?.id;

                  return (
                    <button
                      key={room.id}
                      type="button"
                      className={cn(
                        "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition-colors",
                        "hover:border-primary/30 hover:bg-primary/[0.04]",
                        isSelected ? "border-primary/50 bg-primary/[0.06]" : "bg-background",
                      )}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35 text-primary">
                        <Wine className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold">{room.title}</span>
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {room.systemPresetId ? "系统预设" : "用户酒馆"}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {compactScene(room.scene)}
                        </span>
                      </span>
                    </button>
                  );
                })
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
            disabled={!selectedNodeId || !selectedRoom || isLoading || isConfirming}
          >
            {isConfirming ? "进入中" : "进入酒馆"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SelectPanel = ({
  emptyText,
  options,
  selectedId,
  title,
  onSelect,
}: {
  emptyText: string;
  options: StoryNodeSelectOption[];
  selectedId: string;
  title: string;
  onSelect: (id: string) => void;
}) => {
  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedId) ?? null,
    [options, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">{title}</div>
        {selectedOption?.meta ? (
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {selectedOption.meta}
          </span>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {options.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 text-left transition-colors",
                  "hover:border-primary/30 hover:bg-primary/[0.04]",
                  option.id === selectedId ? "border-primary/50 bg-primary/[0.06]" : "bg-background",
                )}
                onClick={() => onSelect(option.id)}
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
  );
};

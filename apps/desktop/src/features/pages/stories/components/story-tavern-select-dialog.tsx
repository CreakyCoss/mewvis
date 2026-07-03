import { Loader2, Wine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import type { StoryJson } from "@/features/story";
import type { StoryWorkspace } from "@/features/story/storage";
import type { Workspace } from "@/features/pages/workspace/types";
import { loadTavernState } from "@/features/pages/tavern/state/storage";
import type { TavernRoom } from "@/features/pages/tavern/types";
import { compactScene } from "@/features/pages/tavern/utils";
import { cn } from "@/lib/utils";
import { openStoryTavernPresentation } from "./presentations/tavern";

type TavernCarrierWorkspace = {
  id: string;
  name: string;
  path: string;
};

type StoryTavernSelectDialogProps = {
  open: boolean;
  activeStory: StoryJson | null;
  nodeId?: string | null;
  storyWorkspace: StoryWorkspace | null;
  tavernWorkspace: Workspace | null;
  onOpenChange: (open: boolean) => void;
};

const tavernCarrierWorkspaceFrom = (
  workspace: Workspace | null,
  storyWorkspace: StoryWorkspace | null,
): TavernCarrierWorkspace | null => {
  if (workspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
    };
  }

  if (storyWorkspace) {
    return {
      id: storyWorkspace.id,
      name: storyWorkspace.name,
      path: storyWorkspace.path,
    };
  }

  return null;
};

export const StoryTavernSelectDialog = ({
  open,
  activeStory,
  nodeId,
  storyWorkspace,
  tavernWorkspace,
  onOpenChange,
}: StoryTavernSelectDialogProps) => {
  const navigate = useNavigate();
  const carrierWorkspace = useMemo(
    () => tavernCarrierWorkspaceFrom(tavernWorkspace, storyWorkspace),
    [storyWorkspace, tavernWorkspace],
  );
  const [rooms, setRooms] = useState<TavernRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;

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

  const openSelectedTavern = async () => {
    if (!activeStory || !storyWorkspace || !selectedRoom) {
      return;
    }

    setIsOpening(true);
    try {
      await openStoryTavernPresentation({
        storyWorkspace,
        activeStory,
        tavernRoom: selectedRoom,
        navigate,
        nodeId,
        setOpeningStoryId: () => undefined,
      });
      onOpenChange(false);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[min(88vh,42rem)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>选择承载酒馆</DialogTitle>
          <DialogDescription>
            将使用所选酒馆的配置承载当前故事内容，并进入对应故事运行目录。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background">
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

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void openSelectedTavern()}
            disabled={!activeStory || !storyWorkspace || !selectedRoom || isLoading || isOpening}
          >
            {isOpening ? "进入中" : "进入酒馆"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

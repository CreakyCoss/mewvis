import { MessageCircle, Plus, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TavernCharacter, TavernRoom } from "@/features/pages/taverns/tavern/types";
import { compactScene } from "@/features/pages/taverns/tavern/utils";

type SidebarProps = {
  rooms: TavernRoom[];
  activeRoom: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  onCreateRoom: () => void;
  onSelectRoom: (roomId: string) => void;
};

export const Sidebar = ({
  rooms,
  activeRoom,
  characterById,
  onCreateRoom,
  onSelectRoom,
}: SidebarProps) => (
  <aside className="hidden min-h-0 flex-col border-r bg-muted/15 lg:flex">
    <div className="flex h-[73px] items-center justify-between border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Wine className="size-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-semibold">酒馆</span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        title="新建房间"
        aria-label="新建房间"
        onClick={onCreateRoom}
      >
        <Plus className="size-4" />
      </Button>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-1.5 p-3">
        {rooms.map((room) => {
          const isActive = room.id === activeRoom.id;
          const activeRoomCharacter = characterById.get(room.activeCharacterId);

          return (
            <button
              key={room.id}
              type="button"
              className={cn(
                "flex w-full min-w-0 flex-col gap-1 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors",
                "hover:border-border hover:bg-background/80",
                isActive && "border-border bg-background shadow-sm",
              )}
              onClick={() => onSelectRoom(room.id)}
              title={room.title}
            >
              <span className="w-full truncate text-sm font-semibold text-foreground">
                {room.title}
              </span>
              <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {compactScene(room.scene)}
              </span>
              {activeRoomCharacter && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground/85">
                  <MessageCircle className="size-3" />
                  {activeRoomCharacter.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  </aside>
);

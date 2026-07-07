import { useImperativeHandle } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { isTavernRoomBusy, useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { CharacterStatusSection } from "./characters/section";
import { SceneOverviewSection } from "./scene-overview";
import type { SidePanelProps } from "./types";
export type { SidePanelHandle } from "./types";

export const SidePanel = ({ bind, isOpen, onOpenChange }: SidePanelProps) => {
  const { activeRoom, visualPreset, busy } = useTavernRoomContext();
  const isBusy = isTavernRoomBusy(busy);

  useImperativeHandle(
    bind,
    () => ({
      show: () => onOpenChange(true),
      hide: () => onOpenChange(false),
      toggle: () => onOpenChange(!isOpen),
    }),
    [bind, isOpen, onOpenChange],
  );

  if (!isOpen || !activeRoom) {
    return null;
  }

  return (
    <aside className={cn("hidden min-h-0 flex-col border-l lg:flex", visualPreset.tavern.sidePanel)}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <SceneOverviewSection externalBusy={false} />

          <CharacterStatusSection externalBusy={isBusy} />
        </div>
      </ScrollArea>
    </aside>
  );
};

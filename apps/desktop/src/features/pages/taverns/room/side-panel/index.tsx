import { useImperativeHandle, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TavernSceneNovelizerSection } from "@/features/scene-novelizer/adapters/tavern/TavernSceneNovelizerSection";
import { cn } from "@/lib/utils";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { IllustrationHintsPreviewSection } from "./illustration-hints-preview";
import { RuntimeTimelineSection } from "./runtime-timeline";
import { SceneOverviewSection } from "./scene-overview";
import type { SidePanelProps } from "./types";
export type { SidePanelHandle } from "./types";

export const SidePanel = ({ bind, isOpen, onOpenChange }: SidePanelProps) => {
  const { activeRoom, roomCharacters, roomMessages, runtimeModel, visualPreset, workspace, isSending } =
    useTavernRoomContext();
  const [isSceneOperationBusy, setIsSceneOperationBusy] = useState(false);
  const [isNovelizerOperationBusy, setIsNovelizerOperationBusy] = useState(false);

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
          <SceneOverviewSection externalBusy={isNovelizerOperationBusy} onBusyChange={setIsSceneOperationBusy} />

          <IllustrationHintsPreviewSection />

          <TavernSceneNovelizerSection
            room={activeRoom}
            messages={roomMessages}
            characters={roomCharacters}
            workspace={workspace}
            runtimeModel={runtimeModel}
            disabled={isSending || isSceneOperationBusy}
            onBusyChange={setIsNovelizerOperationBusy}
          />

          <RuntimeTimelineSection />
        </div>
      </ScrollArea>
    </aside>
  );
};

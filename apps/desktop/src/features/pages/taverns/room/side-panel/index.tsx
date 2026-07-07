import { useImperativeHandle, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { CharacterStatusSection } from "./characters/section";
import { IllustrationHintsPreviewSection } from "./illustration-hints-preview";
import { PlotDataSection, type PlotDataSectionHandle } from "./plot-data";
import { RuntimeTimelineSection } from "./runtime-timeline";
import { SceneOverviewSection } from "./scene-overview";
import type { SidePanelProps } from "./types";
export type { SidePanelHandle } from "./types";

export const SidePanel = ({ bind, isOpen, onOpenChange }: SidePanelProps) => {
  const { activeRoom, visualPreset, isSending } = useTavernRoomContext();
  const [isSceneOperationBusy, setIsSceneOperationBusy] = useState(false);
  const [isPlotDataOperationBusy, setIsPlotDataOperationBusy] = useState(false);
  const [isCharacterOperationBusy, setIsCharacterOperationBusy] = useState(false);
  const plotDataSectionRef = useRef<PlotDataSectionHandle | null>(null);

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
          <SceneOverviewSection
            externalBusy={isPlotDataOperationBusy || isCharacterOperationBusy}
            onBusyChange={setIsSceneOperationBusy}
            onOpenTipsDetail={() => plotDataSectionRef.current?.open("tips")}
          />

          <IllustrationHintsPreviewSection />

          <RuntimeTimelineSection />

          <CharacterStatusSection
            externalBusy={isSending || isSceneOperationBusy || isPlotDataOperationBusy}
            onBusyChange={setIsCharacterOperationBusy}
          />

          <PlotDataSection
            bind={plotDataSectionRef}
            externalBusy={isSending || isSceneOperationBusy || isCharacterOperationBusy}
            onBusyChange={setIsPlotDataOperationBusy}
          />
        </div>
      </ScrollArea>
    </aside>
  );
};

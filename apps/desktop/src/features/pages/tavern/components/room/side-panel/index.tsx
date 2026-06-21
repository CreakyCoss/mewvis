import { useImperativeHandle, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTavernPageContext } from "../../context";
import { CharacterStatusSection } from "./characters/section";
import { IllustrationHintsPreviewSection } from "./illustration-hints-preview";
import { PlotDataSection, type PlotDataSectionHandle } from "./plot-data";
import { SceneOverviewSection } from "./scene-overview";
import type {
  SidePanelProps,
} from "./types";
export type { SidePanelHandle } from "./types";

export const SidePanel = ({
  bind,
  isOpen,
  onOpenChange,
}: SidePanelProps) => {
  const {
    activeRoom,
    visualPreset,
    isSending,
  } = useTavernPageContext();
  const [isSceneOperationBusy, setIsSceneOperationBusy] = useState(false);
  const [isPlotDataOperationBusy, setIsPlotDataOperationBusy] = useState(false);
  const [isCharacterOperationBusy, setIsCharacterOperationBusy] = useState(false);
  const plotDataRef = useRef<PlotDataSectionHandle | null>(null);
  const isBusy =
    isSending ||
    isSceneOperationBusy ||
    isPlotDataOperationBusy ||
    isCharacterOperationBusy;

  useImperativeHandle(bind, () => ({
    show: () => onOpenChange(true),
    hide: () => onOpenChange(false),
    toggle: () => onOpenChange(!isOpen),
  }), [bind, isOpen, onOpenChange]);

  if (!isOpen || !activeRoom) {
    return null;
  }

  return (
    <aside
      className={cn(
        "hidden min-h-0 flex-col border-l lg:flex",
        visualPreset.tavern.sidePanel,
      )}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <SceneOverviewSection
            externalBusy={isPlotDataOperationBusy || isCharacterOperationBusy}
            onBusyChange={setIsSceneOperationBusy}
            onOpenTasksDetail={() => plotDataRef.current?.open("tasks-outcomes")}
            onOpenTipsDetail={() => plotDataRef.current?.open("tips")}
            onOpenScriptReviewDetail={() => plotDataRef.current?.open("script-review")}
          />

          <IllustrationHintsPreviewSection />

          <CharacterStatusSection
            externalBusy={isBusy}
            onBusyChange={setIsCharacterOperationBusy}
          />

          <PlotDataSection
            externalBusy={isSending || isSceneOperationBusy || isCharacterOperationBusy}
            onBusyChange={setIsPlotDataOperationBusy}
            bind={plotDataRef}
          />
        </div>
      </ScrollArea>

    </aside>
  );
};

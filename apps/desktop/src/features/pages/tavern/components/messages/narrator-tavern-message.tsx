import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type { TavernFactEvent } from "../../types";
import { MessageControls } from "./message-controls";
import { MessagePrivateIntel } from "./message-private-intel";

type NarratorTavernMessageProps = {
  content: string;
  factEvents?: TavernFactEvent[];
  isStreaming: boolean;
  visualPreset: VisualPresetDefinition;
};
export const NarratorTavernMessage = ({
  content,
  factEvents,
  isStreaming,
  visualPreset,
}: NarratorTavernMessageProps) => (
  <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm",
        visualPreset.tavern.narratorBubble,
      )}
    >
      {content}
    </div>
    <MessagePrivateIntel align="center" factEvents={factEvents} />
    <MessageControls content={content} disabled={isStreaming} />
  </div>
);

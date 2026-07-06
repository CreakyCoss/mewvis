import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets";
import { cn } from "@/lib/utils";
import type { TavernFactEvent } from "@/features/pages/taverns/manage/model";
import { MessageControls } from "./message-controls";
import { MessagePrivateIntel } from "./message-private-intel";

type NarratorMessageProps = {
  content: string;
  factEvents?: TavernFactEvent[];
  isStreaming: boolean;
  visualPreset: VisualPresetDefinition;
};
export const NarratorMessage = ({ content, factEvents, isStreaming, visualPreset }: NarratorMessageProps) => (
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

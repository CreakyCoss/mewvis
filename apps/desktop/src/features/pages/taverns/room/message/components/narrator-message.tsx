import type { VisualPresetDefinition } from "@/features/pages/taverns/tavern/visual-presets/types";
import { cn } from "@/lib/utils";
import { MessageControls } from "./message-controls";

type NarratorMessageProps = {
  content: string;
  isStreaming: boolean;
  visualPreset: VisualPresetDefinition;
};
export const NarratorMessage = ({ content, isStreaming, visualPreset }: NarratorMessageProps) => (
  <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm",
        visualPreset.tavern.narratorBubble,
      )}
    >
      {content}
    </div>
    <MessageControls content={content} disabled={isStreaming} />
  </div>
);

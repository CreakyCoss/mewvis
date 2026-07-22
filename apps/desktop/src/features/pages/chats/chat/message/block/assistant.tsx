import { Spinner } from "@/components/ui/spinner";
import type { ChatAssistantMessageBlock } from "../../type";
import { TextBlock } from "./types/text";
import { ThinkingBlock } from "./types/thinking";
import { ToolBlock } from "./types/tool";

type AssistantBlocksProps = {
  blocks: ChatAssistantMessageBlock[];
  isRunning: boolean;
  agentName?: string;
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};

export const AssistantBlocks = ({
  blocks,
  isRunning,
  agentName,
  showThinkingProcess,
  showToolCallProcess,
}: AssistantBlocksProps) => {
  const visibleBlocks = blocks.filter(
    (block) =>
      block.type === "text" ||
      (block.type === "thinking" && showThinkingProcess) ||
      (block.type === "tool" && showToolCallProcess),
  );
  const activeBlockId = isRunning ? blocks.at(-1)?.id : undefined;

  if (visibleBlocks.length === 0) {
    return isRunning ? (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner />
        <span>{agentName ? "Agent 正在处理" : "AI 正在思考"}</span>
      </div>
    ) : null;
  }

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
      {visibleBlocks.map((block) => {
        if (block.type === "thinking") {
          return <ThinkingBlock key={block.id} block={block} isActive={block.id === activeBlockId} />;
        }

        if (block.type === "tool") {
          return <ToolBlock key={block.id} block={block} />;
        }

        return <TextBlock key={block.id} block={block} role="assistant" />;
      })}
    </div>
  );
};

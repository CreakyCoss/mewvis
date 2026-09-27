import { BotIcon, WorkflowIcon } from "lucide-react";
import type { ChatUserMessageBlock } from "@/chat/core";
import { FileReferenceBlock } from "./types/file-reference";
import { SkillReferenceBlock } from "./types/skill-reference";
import { TextBlock } from "./types/text";

type UserBlocksProps = {
  blocks: ChatUserMessageBlock[];
};

export const UserBlocks = ({ blocks }: UserBlocksProps) => (
  <div className="min-w-0 max-w-full break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
    {blocks.map((block) => {
      if (block.type === "file-reference") {
        return <FileReferenceBlock key={block.id} block={block} />;
      }

      if (block.type === "skill-reference") {
        return <SkillReferenceBlock key={block.id} block={block} />;
      }

      if (block.type === "command-reference" || block.type === "agent-reference") {
        return (
          <span
            key={block.id}
            title={block.name}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary-foreground/15 px-2 py-0.5 align-middle text-xs font-medium"
          >
            {block.type === "agent-reference" ? (
              <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{block.name}</span>
          </span>
        );
      }
      return <TextBlock key={block.id} block={block} />;
    })}
  </div>
);

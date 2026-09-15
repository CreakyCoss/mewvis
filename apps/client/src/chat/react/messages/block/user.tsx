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

      return <TextBlock key={block.id} block={block} />;
    })}
  </div>
);

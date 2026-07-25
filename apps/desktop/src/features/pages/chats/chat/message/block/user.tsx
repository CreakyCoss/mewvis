import type { ChatUserMessageBlock } from "../../type";
import { FileReferenceBlock } from "./types/file-reference";
import { SkillReferenceBlock } from "./types/skill-reference";
import { TextBlock } from "./types/text";

type UserBlocksProps = {
  blocks: ChatUserMessageBlock[];
};

export const UserBlocks = ({ blocks }: UserBlocksProps) => (
  <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
    {blocks.map((block) => {
      if (block.type === "file-reference") {
        return <FileReferenceBlock key={block.id} block={block} />;
      }

      if (block.type === "skill-reference") {
        return <SkillReferenceBlock key={block.id} block={block} />;
      }

      return <TextBlock key={block.id} block={block} role="user" />;
    })}
  </div>
);

import type { ChatAssistantMessageBlock, ChatMessage, ChatUserMessageBlock } from "../../../type";
import { MessageMarkdown } from "../../markdown";

type TextBlockProps = {
  block: Extract<ChatAssistantMessageBlock, { type: "text" }> | Extract<ChatUserMessageBlock, { type: "text" }>;
  role: ChatMessage["role"];
};

export const TextBlock = ({ block, role }: TextBlockProps) =>
  role === "assistant" ? (
    <div className="min-w-0 max-w-full overflow-hidden">
      <MessageMarkdown content={block.content} />
    </div>
  ) : (
    <div className="basis-full break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{block.content}</div>
  );

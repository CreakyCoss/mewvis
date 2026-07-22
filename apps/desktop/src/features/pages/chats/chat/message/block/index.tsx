import type { ChatMessage } from "../../type";
import { AssistantBlocks } from "./assistant";
import { UserBlocks } from "./user";

type MessageBlocksProps = {
  message: ChatMessage;
};

export const MessageBlocks = ({ message }: MessageBlocksProps) => {
  if (message.role === "user") {
    return <UserBlocks blocks={message.blocks} />;
  }

  return (
    <AssistantBlocks
      blocks={message.blocks}
      isRunning={message.status === "loading" || message.status === "streaming"}
      agentName={message.agentName}
      showThinkingProcess={message.showThinkingProcess}
      showToolCallProcess={message.showToolCallProcess}
    />
  );
};

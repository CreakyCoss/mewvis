import type { ChatDisplayOptions } from "../../../components/chat-input/type";
import type { ChatMessage } from "../../type";
import { AssistantBlocks } from "./assistant";
import { UserBlocks } from "./user";

type MessageBlocksProps = {
  message: ChatMessage;
  displayOptions: ChatDisplayOptions;
};

export const MessageBlocks = ({ message, displayOptions }: MessageBlocksProps) => {
  if (message.role === "user") {
    return <UserBlocks blocks={message.blocks} />;
  }

  return (
    <AssistantBlocks
      blocks={message.blocks}
      isRunning={message.status === "loading" || message.status === "streaming"}
      agentName={message.agentName}
      showThinkingProcess={displayOptions.showThinkingProcess}
      showToolCallProcess={displayOptions.showToolCallProcess}
    />
  );
};

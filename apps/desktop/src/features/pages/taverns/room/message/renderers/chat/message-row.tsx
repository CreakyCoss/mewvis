import type { ReactElement } from "react";
import type { MessageRole, MessageVisualStyle, RenderableMessage } from "../../types";
import { CharacterMessage } from "./character-message";
import { NarratorMessage } from "./narrator-message";
import { UserMessage } from "./user-message";

type MessageRowProps = {
  message: RenderableMessage;
  immersiveDescriptionEnabled: boolean;
  isSending: boolean;
  visualStyle: MessageVisualStyle;
};

type MessageRoleRendererContext = {
  immersiveDescriptionEnabled: boolean;
  isSending: boolean;
  message: RenderableMessage;
  visualStyle: MessageVisualStyle;
};

const messageRoleRenderers: Record<MessageRole, (context: MessageRoleRendererContext) => ReactElement> = {
  narrator: ({ message, visualStyle }) => (
    <NarratorMessage content={message.content} isStreaming={message.status === "streaming"} visualStyle={visualStyle} />
  ),
  user: ({ isSending, message, visualStyle }) => (
    <UserMessage
      content={message.content}
      createdAt={message.createdAt}
      isSending={isSending}
      isStreaming={message.status === "streaming"}
      referencedFiles={message.referencedFiles}
      speakerName={message.speakerName}
      visualStyle={visualStyle}
    />
  ),
  character: ({ immersiveDescriptionEnabled, message, visualStyle }) => (
    <CharacterMessage
      character={message.character!}
      createdAt={message.createdAt}
      immersiveDescriptionEnabled={immersiveDescriptionEnabled}
      isError={message.status === "error"}
      isStreaming={message.status === "streaming"}
      segments={message.segments}
      thought={message.thought}
      visualStyle={visualStyle}
    />
  ),
};

export const MessageRow = ({ message, immersiveDescriptionEnabled, isSending, visualStyle }: MessageRowProps) => {
  const renderMessage = messageRoleRenderers[message.role];

  return renderMessage({
    immersiveDescriptionEnabled,
    isSending,
    message,
    visualStyle,
  });
};

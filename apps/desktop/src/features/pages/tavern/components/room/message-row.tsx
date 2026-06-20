import type { TavernRenderableMessage } from "../../core";
import { useTavernPageContext } from "../context";
import { CharacterMessage } from "./messages/character-message";
import { NarratorMessage } from "./messages/narrator-message";
import { UserMessage } from "./messages/user-message";

type MessageRowProps = {
  message: TavernRenderableMessage;
};
export const MessageRow = ({
  message,
}: MessageRowProps) => {
  const {
    activeRoom,
    characterById,
    isSending,
    visualPreset,
  } = useTavernPageContext();
  if (!activeRoom) {
    return null;
  }

  const character = message.characterId ? characterById.get(message.characterId) : null;

  if (message.role === "narrator") {
    return (
      <NarratorMessage
        content={message.content}
        factEvents={message.userVisibleFactEvents}
        isStreaming={message.status === "streaming"}
        visualPreset={visualPreset}
      />
    );
  }

  if (message.role === "user") {
    return (
      <UserMessage
        content={message.content}
        createdAt={message.createdAt}
        factEvents={message.userVisibleFactEvents}
        isSending={isSending}
        isStreaming={message.status === "streaming"}
        referencedFiles={message.referencedFiles}
        userPersonaName={activeRoom.userPersonaName}
        visualPreset={visualPreset}
      />
    );
  }

  return (
    <CharacterMessage
      character={character}
      content={message.content}
      createdAt={message.createdAt}
      factEvents={message.userVisibleFactEvents}
      immersiveDescriptionEnabled={activeRoom.settings.immersiveDescriptionEnabled !== false}
      isError={message.status === "error"}
      isStreaming={message.status === "streaming"}
      thought={message.thought}
      visualPreset={visualPreset}
    />
  );
};

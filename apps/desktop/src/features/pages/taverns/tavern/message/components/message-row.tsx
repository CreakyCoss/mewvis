import type { ReactElement } from "react";
import type { TavernCharacter, TavernMessage, TavernRoom } from "../../types";
import { useTavernPageContext } from "@/features/pages/taverns/components/context";
import type { TavernRenderableMessage } from "../domain/render-model";
import { CharacterMessage } from "./character-message";
import { NarratorMessage } from "./narrator-message";
import { UserMessage } from "./user-message";

type MessageRowProps = {
  message: TavernRenderableMessage;
};

type MessageRoleRendererContext = {
  activeRoom: TavernRoom;
  character: TavernCharacter | null;
  isSending: boolean;
  message: TavernRenderableMessage;
  visualPreset: ReturnType<typeof useTavernPageContext>["visualPreset"];
};

const messageRoleRenderers: Record<
  TavernMessage["role"],
  (context: MessageRoleRendererContext) => ReactElement
> = {
  narrator: ({ message, visualPreset }) => (
    <NarratorMessage
      content={message.content}
      factEvents={message.userVisibleFactEvents}
      isStreaming={message.status === "streaming"}
      visualPreset={visualPreset}
    />
  ),
  user: ({ activeRoom, isSending, message, visualPreset }) => (
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
  ),
  character: ({ activeRoom, character, message, visualPreset }) => (
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
  ),
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

  const character = message.characterId ? characterById.get(message.characterId) ?? null : null;
  const renderMessage = messageRoleRenderers[message.role];

  return renderMessage({
    activeRoom,
    character,
    isSending,
    message,
    visualPreset,
  });
};

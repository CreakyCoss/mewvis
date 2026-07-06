import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { ReactElement } from "react";
import type { TavernMessage } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
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
  visualPreset: ReturnType<typeof useTavernRoomContext>["visualPreset"];
};

const messageRoleRenderers: Record<TavernMessage["role"], (context: MessageRoleRendererContext) => ReactElement> = {
  narrator: ({ message, visualPreset }) => (
    <NarratorMessage
      content={message.content}
      isStreaming={message.status === "streaming"}
      visualPreset={visualPreset}
    />
  ),
  user: ({ activeRoom, isSending, message, visualPreset }) => (
    <UserMessage
      content={message.content}
      createdAt={message.createdAt}
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
      immersiveDescriptionEnabled={activeRoom.settings.immersiveDescriptionEnabled !== false}
      isError={message.status === "error"}
      isStreaming={message.status === "streaming"}
      thought={message.thought}
      visualPreset={visualPreset}
    />
  ),
};

export const MessageRow = ({ message }: MessageRowProps) => {
  const { activeRoom, characterById, isSending, visualPreset } = useTavernRoomContext();
  if (!activeRoom) {
    return null;
  }

  const character = message.characterId ? (characterById.get(message.characterId) ?? null) : null;
  const renderMessage = messageRoleRenderers[message.role];

  return renderMessage({
    activeRoom,
    character,
    isSending,
    message,
    visualPreset,
  });
};

import type { TavernRenderableMessage } from "../core";
import type {
  TavernCharacter,
  TavernRoom,
} from "../types";
import type { VisualPresetDefinition } from "@/features/pages/tavern/visual-presets";
import { CharacterTavernMessage } from "./messages/character-tavern-message";
import { NarratorTavernMessage } from "./messages/narrator-tavern-message";
import { UserTavernMessage } from "./messages/user-tavern-message";

type TavernMessageRowProps = {
  message: TavernRenderableMessage;
  room: TavernRoom;
  visualPreset: VisualPresetDefinition;
  character?: TavernCharacter | null;
  isSending: boolean;
};
export const TavernMessageRow = ({
  message,
  room,
  visualPreset,
  character,
  isSending,
}: TavernMessageRowProps) => {
  if (message.role === "narrator") {
    return (
      <NarratorTavernMessage
        content={message.content}
        isStreaming={message.status === "streaming"}
        visualPreset={visualPreset}
      />
    );
  }

  if (message.role === "user") {
    return (
      <UserTavernMessage
        content={message.content}
        createdAt={message.createdAt}
        isSending={isSending}
        isStreaming={message.status === "streaming"}
        referencedFiles={message.referencedFiles}
        userPersonaName={room.userPersonaName}
        visualPreset={visualPreset}
      />
    );
  }

  return (
    <CharacterTavernMessage
      character={character}
      content={message.content}
      createdAt={message.createdAt}
      immersiveDescriptionEnabled={room.settings.immersiveDescriptionEnabled !== false}
      isError={message.status === "error"}
      isStreaming={message.status === "streaming"}
      thought={message.thought}
      visualPreset={visualPreset}
    />
  );
};

import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { createTavernCharacter } from "../../../../../storage";
import type { TavernCharacter, TavernRoom } from "../../../../../types";
import type { TavernTextFieldAgentRequest } from "../../../../../runtime/assistants";
import {
  CharacterFormDialog,
  type CharacterFormValue,
} from "./form-dialog";
import type { ModuleSave } from "../types";

export type CharactersEditHandle = (character?: TavernCharacter | null) => void;

type CharactersEditProps = {
  bind: Ref<CharactersEditHandle>;
  data: TavernRoom;
  modelLabel: string;
  onSave: ModuleSave;
  onRunTextFieldAgent?: (request: TavernTextFieldAgentRequest) => Promise<string>;
};

export const CharactersEdit = ({
  bind,
  data,
  onSave,
  modelLabel,
  onRunTextFieldAgent,
}: CharactersEditProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<TavernCharacter | null>(null);

  const open = (character: TavernCharacter | null = null) => {
    setEditingCharacter(character);
    setIsOpen(true);
  };

  useImperativeHandle(bind, () => open);

  const save = (value: CharacterFormValue) => {
    if (editingCharacter) {
      onSave({
        localCharacters: (data.localCharacters ?? []).map((character) =>
          character.id === editingCharacter.id
            ? {
                ...character,
                name: value.name,
                avatar: value.avatar,
                description: value.description,
                speakingStyle: value.speakingStyle,
                writingStyle: value.writingStyle?.trim() || undefined,
                replyStylePrompt: value.replyStylePrompt?.trim() || undefined,
                goals: value.goals?.trim() || undefined,
                relationships: value.relationships,
                updatedAt: Date.now(),
              }
            : character
        ),
      });
    } else {
      onSave({
        localCharacters: [
          ...(data.localCharacters ?? []),
          createTavernCharacter(value),
        ],
      });
    }

    setEditingCharacter(null);
    setIsOpen(false);
  };

  return (
    <CharacterFormDialog
      open={isOpen}
      character={editingCharacter}
      availableCharacters={data.localCharacters ?? []}
      roomModelLabel={modelLabel}
      onRunTextFieldAgent={onRunTextFieldAgent}
      onOpenChange={(openState) => {
        setIsOpen(openState);
        if (!openState) {
          setEditingCharacter(null);
        }
      }}
      onSubmit={save}
    />
  );
};

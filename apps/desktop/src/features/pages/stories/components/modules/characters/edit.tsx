import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Plus, Save, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryAsset, StoryContextCharacter } from "@/features/story";
import {
  createStoryCharacter,
  emptyCharacterMemory,
} from "../../story-form-utils";
import { EmptyBlock } from "../../story-primitives";
import type { StoryModuleSave } from "../types";
import { StoryCharacterEditCard } from "./character-card";

export type StoryCharactersEditHandle = (story?: StoryAsset) => void;

type StoryCharactersEditProps = {
  bind: Ref<StoryCharactersEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryCharactersEdit = ({
  bind,
  story,
  onSave,
}: StoryCharactersEditProps) => {
  const [draft, setDraft] = useState<StoryAsset | null>(null);

  const open = (nextStory = story) => {
    setDraft(nextStory);
  };

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const updateCharacter = (
    characterId: string,
    updater: (character: StoryContextCharacter) => StoryContextCharacter,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            characters: current.characters.map((character) =>
              character.id === characterId ? updater(character) : character
            ),
          }
        : current
    );
  };

  const updateMemory = (
    characterId: string,
    field: keyof NonNullable<StoryContextCharacter["memory"]>,
    value: string,
  ) => {
    updateCharacter(characterId, (character) => ({
      ...character,
      memory: {
        ...emptyCharacterMemory(),
        ...character.memory,
        [field]: value,
      },
    }));
  };

  const save = () => {
    if (!draft) {
      return;
    }
    onSave(draft);
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <DialogContent className="max-h-[min(90vh,52rem)] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="size-4" />
              编辑角色
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[min(68vh,40rem)] pr-3">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      characters: [
                        ...draft.characters,
                        createStoryCharacter(draft.characters.length),
                      ],
                    })
                  }
                >
                  <Plus className="size-4" />
                  添加角色
                </Button>
              </div>
              {draft.characters.length === 0 ? (
                <EmptyBlock text="暂无角色" />
              ) : (
                draft.characters.map((character, index) => (
                  <StoryCharacterEditCard
                    key={character.id}
                    character={character}
                    draft={draft}
                    index={index}
                    onDraftChange={setDraft}
                    onUpdateCharacter={updateCharacter}
                    onUpdateMemory={updateMemory}
                  />
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="button" className="gap-2" onClick={save}>
              <Save className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};

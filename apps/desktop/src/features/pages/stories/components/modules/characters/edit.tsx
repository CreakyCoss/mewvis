import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Plus, Save, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextCharacter } from "@/features/story";
import {
  createStoryCharacter,
  EditorField,
  emptyCharacterMemory,
  EmptyBlock,
} from "../../shared";
import type { StoryModuleSave } from "../types";

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
                  <div key={character.id} className="rounded-md border p-3">
                    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {character.name || `角色 ${index + 1}`}
                        </div>
                        <div className="text-xs text-muted-foreground">{character.id}</div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            characters: draft.characters.filter((item) => item.id !== character.id),
                          })
                        }
                        title="删除角色"
                        aria-label="删除角色"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <EditorField label="名称">
                        <Input
                          value={character.name}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="目标">
                        <Input
                          value={character.goals ?? ""}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              goals: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="人设">
                        <Textarea
                          className="min-h-28 resize-y"
                          value={character.description}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="说话风格">
                        <Textarea
                          className="min-h-28 resize-y"
                          value={character.speakingStyle}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              speakingStyle: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="写作风格">
                        <Textarea
                          className="min-h-24 resize-y"
                          value={character.writingStyle ?? ""}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              writingStyle: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="回复提示">
                        <Textarea
                          className="min-h-24 resize-y"
                          value={character.replyStylePrompt ?? ""}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              replyStylePrompt: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="公开关系">
                        <Textarea
                          className="min-h-20 resize-y"
                          value={character.publicRelationshipSummary ?? ""}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              publicRelationshipSummary: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="完整关系">
                        <Textarea
                          className="min-h-20 resize-y"
                          value={character.relationshipSummary ?? ""}
                          onChange={(event) =>
                            updateCharacter(character.id, (current) => ({
                              ...current,
                              relationshipSummary: event.target.value,
                            }))
                          }
                        />
                      </EditorField>
                      <EditorField label="公开记忆">
                        <Textarea
                          className="min-h-20 resize-y"
                          value={character.memory?.public ?? ""}
                          onChange={(event) => updateMemory(character.id, "public", event.target.value)}
                        />
                      </EditorField>
                      <EditorField label="私密记忆">
                        <Textarea
                          className="min-h-20 resize-y"
                          value={character.memory?.privateSelf ?? ""}
                          onChange={(event) => updateMemory(character.id, "privateSelf", event.target.value)}
                        />
                      </EditorField>
                      <div className="lg:col-span-2">
                        <EditorField label="导演秘密">
                          <Textarea
                            className="min-h-20 resize-y"
                            value={character.memory?.directorSecret ?? ""}
                            onChange={(event) =>
                              updateMemory(character.id, "directorSecret", event.target.value)
                            }
                          />
                        </EditorField>
                      </div>
                    </div>
                  </div>
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

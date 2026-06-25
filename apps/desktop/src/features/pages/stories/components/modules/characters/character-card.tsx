import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextCharacter } from "@/features/story";
import { EditorField } from "../../story-primitives";

type StoryCharacterEditCardProps = {
  character: StoryContextCharacter;
  draft: StoryAsset;
  index: number;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateCharacter: (
    characterId: string,
    updater: (character: StoryContextCharacter) => StoryContextCharacter,
  ) => void;
  onUpdateMemory: (
    characterId: string,
    field: keyof NonNullable<StoryContextCharacter["memory"]>,
    value: string,
  ) => void;
};

export const StoryCharacterEditCard = ({
  character,
  draft,
  index,
  onDraftChange,
  onUpdateCharacter,
  onUpdateMemory,
}: StoryCharacterEditCardProps) => (
  <div className="rounded-md border p-3">
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
          onDraftChange({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
            onUpdateCharacter(character.id, (current) => ({
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
          onChange={(event) => onUpdateMemory(character.id, "public", event.target.value)}
        />
      </EditorField>
      <EditorField label="私密记忆">
        <Textarea
          className="min-h-20 resize-y"
          value={character.memory?.privateSelf ?? ""}
          onChange={(event) => onUpdateMemory(character.id, "privateSelf", event.target.value)}
        />
      </EditorField>
      <div className="lg:col-span-2">
        <EditorField label="导演秘密">
          <Textarea
            className="min-h-20 resize-y"
            value={character.memory?.directorSecret ?? ""}
            onChange={(event) =>
              onUpdateMemory(character.id, "directorSecret", event.target.value)
            }
          />
        </EditorField>
      </div>
    </div>
  </div>
);

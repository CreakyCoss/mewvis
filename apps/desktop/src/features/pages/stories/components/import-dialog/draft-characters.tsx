import { Trash2, UsersRound } from "lucide-react";
import {
  resolveAgentAvatar,
  tavernAvatarOptions,
} from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resolveStoryCharacterAvatar,
  type StoryImportDraft,
} from "@/features/story";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorField, EmptyBlock, StorySection } from "../story-primitives";
import { updateImportCharacter } from "./draft-utils";

type StoryImportDraftCharactersProps = {
  draft: StoryImportDraft;
  onChange: (draft: StoryImportDraft) => void;
};

export const StoryImportDraftCharacters = ({
  draft,
  onChange,
}: StoryImportDraftCharactersProps) => (
  <StorySection icon={UsersRound} title="角色">
    {draft.characters.length === 0 ? (
      <EmptyBlock text="暂无角色" />
    ) : (
      <div className="space-y-3">
        {draft.characters.map((character) => {
          const avatarId = resolveStoryCharacterAvatar({
            avatar: character.avatar,
            characterId: character.id,
          });
          const avatar = resolveAgentAvatar(avatarId);
          return (
            <div key={character.id} className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium">{character.name}</div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    onChange({
                      ...draft,
                      characters: draft.characters.filter((item) => item.id !== character.id),
                    })
                  }
                  title="移除角色"
                  aria-label="移除角色"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="flex size-16 overflow-hidden rounded-md border bg-background">
                  <img
                    src={avatar.src}
                    alt={character.name}
                    className="size-full object-cover"
                  />
                </span>
                <EditorField label="名称">
                  <Input
                    value={character.name}
                    onChange={(event) =>
                      onChange(updateImportCharacter(draft, character.id, {
                        name: event.target.value,
                      }))
                    }
                  />
                </EditorField>
                <EditorField label="头像">
                  <Select
                    value={avatarId}
                    onValueChange={(value) =>
                      onChange(updateImportCharacter(draft, character.id, {
                        avatar: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tavernAvatarOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <EditorField label="说话风格">
                  <Input
                    value={character.speakingStyle}
                    onChange={(event) =>
                      onChange(updateImportCharacter(draft, character.id, {
                        speakingStyle: event.target.value,
                      }))
                    }
                  />
                </EditorField>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </StorySection>
);

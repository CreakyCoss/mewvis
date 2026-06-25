import { Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StoryImportDraft } from "@/features/story";
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
        {draft.characters.map((character) => (
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
            <div className="grid gap-3 md:grid-cols-2">
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
        ))}
      </div>
    )}
  </StorySection>
);

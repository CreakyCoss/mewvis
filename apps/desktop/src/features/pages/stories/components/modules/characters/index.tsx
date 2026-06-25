import { Pencil, UsersRound } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { EmptyBlock, StorySection } from "../../shared";
import type { StoryModuleSave } from "../types";
import { StoryCharactersEdit, type StoryCharactersEditHandle } from "./edit";

type StoryCharactersModuleProps = {
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryCharactersModule = ({
  story,
  onSave,
}: StoryCharactersModuleProps) => {
  const editRef = useRef<StoryCharactersEditHandle>(null);

  return (
    <>
      <StorySection
        icon={UsersRound}
        title="角色"
        description="维护角色人设、说话风格、关系和角色记忆。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => editRef.current?.(story)}
          >
            <Pencil className="size-4" />
            编辑
          </Button>
        )}
      >
        {story.characters.length === 0 ? (
          <EmptyBlock text="暂无角色" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {story.characters.map((character) => (
              <div key={character.id} className="rounded-md border px-3 py-2">
                <div className="truncate text-sm font-medium">{character.name}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {character.description || character.speakingStyle || "未填写人设"}
                </div>
              </div>
            ))}
          </div>
        )}
      </StorySection>

      <StoryCharactersEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};

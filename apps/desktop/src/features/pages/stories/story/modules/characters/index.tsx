import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useRef } from "react";
import { resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import type { StoryJson } from "../../model/types";
import {
  EmptyBlock,
  StorySection,
  editorHeaderActionButtonClassName,
  editorDangerIconActionButtonClassName,
  editorIconActionButtonClassName,
  emptyValueText,
} from "../../../components/story-primitives";
import { formatCount } from "../../../components/story-form-utils";
import type { StoryModuleSave } from "../types";
import { StoryCharactersEdit, type StoryCharactersEditHandle } from "./edit";

type StoryCharactersModuleProps = {
  story: StoryJson;
  onSave: StoryModuleSave;
};

export const StoryCharactersModule = ({ story, onSave }: StoryCharactersModuleProps) => {
  const editRef = useRef<StoryCharactersEditHandle>(null);
  const deleteCharacter = (characterId: string) => {
    onSave({
      ...story,
      characters: story.characters.filter((character) => character.id !== characterId),
      updatedAt: Date.now(),
    });
  };

  return (
    <>
      <StorySection
        icon={UsersRound}
        title="角色"
        description="维护角色人设、说话风格、关系和角色记忆。"
        meta={formatCount(story.characters.length, "角色")}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.(null)}
          >
            <Plus className="size-3.5" />
            新建
          </Button>
        }
        contentClassName="space-y-0"
      >
        {story.characters.length === 0 ? (
          <EmptyBlock text="暂无角色" />
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {story.characters.map((character) => {
              const avatar = resolveAvatar(character.avatar);
              return (
                <div
                  key={character.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-background/80 p-2.5"
                >
                  <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                      <img src={avatar.src} alt={character.name} className="size-full object-cover" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium leading-5">{character.name || emptyValueText}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {character.speakingStyle.trim() || character.description.trim() || emptyValueText}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className={editorIconActionButtonClassName}
                      title="编辑角色资料"
                      aria-label={`编辑${character.name || "角色"}的角色资料`}
                      onClick={() => editRef.current?.(character)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className={editorDangerIconActionButtonClassName}
                      title="删除角色"
                      aria-label={`删除${character.name || "角色"}`}
                      onClick={() => deleteCharacter(character.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StorySection>

      <StoryCharactersEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};

import { Pencil, Plus, UsersRound } from "lucide-react";
import { useRef } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernRoom } from "../../../../../types";
import {
  formatTavernCharacterRelationshipSummary,
} from "../../../../../core/relationships";
import type { TavernTextFieldAgentRequest } from "../../../../../runtime/field-polish-agent";
import {
  EditorSection,
  editorHeaderActionButtonClassName,
  editorIconActionButtonClassName,
} from "../../primitives";
import {
  emptyValueText,
  formatCount,
} from "../../utils";
import { CharactersEdit, type CharactersEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type CharactersSectionProps = {
  data: TavernRoom;
  globalRuntimeModel: RuntimeModelOption | null;
  onSave: ModuleSave;
  onRunTextFieldAgent?: (request: TavernTextFieldAgentRequest) => Promise<string>;
};

export const CharactersSection = ({
  data,
  globalRuntimeModel,
  onSave,
  onRunTextFieldAgent,
}: CharactersSectionProps) => {
  const editRef = useRef<CharactersEditHandle>(null);
  const localCharacters = data.localCharacters ?? [];
  const scenes = data.scenes ?? [];
  const modelLabel = globalRuntimeModel
    ? `${globalRuntimeModel.provider.name} / ${
        globalRuntimeModel.modelName || globalRuntimeModel.modelId
      }`
    : "未选择";

  return (
    <>
      <EditorSection
        icon={UsersRound}
        title="酒馆角色库"
        description="维护可被各故事场景引用的角色定义；出场关系和场景记忆在故事场景中编辑。"
        meta={formatCount(localCharacters.length, "角色")}
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.()}
          >
            <Plus className="size-3.5" />
            新建
          </Button>
        )}
        contentClassName="space-y-0"
      >
        <TooltipProvider delayDuration={180}>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {localCharacters.map((character) => {
              const referencedSceneCount = scenes.filter((scene) =>
                scene.characterIds.includes(character.id)
              ).length;
              const relationshipSummary = formatTavernCharacterRelationshipSummary({
                character,
                room: data,
              });

              return (
                <Tooltip key={character.id}>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-background/80 p-2.5">
                    <TooltipTrigger asChild>
                      <div
                        tabIndex={0}
                        className="grid min-w-0 cursor-default grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <img
                          src={resolveAgentAvatar(character.avatar).src}
                          alt=""
                          className="size-10 rounded-md border bg-muted/20"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium leading-5">
                            {character.name}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {character.speakingStyle.trim() || emptyValueText}
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className={editorIconActionButtonClassName}
                      title="编辑角色资料"
                      aria-label={`编辑${character.name}的角色资料`}
                      onClick={() => editRef.current?.(character)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-sm p-3 text-left"
                    >
                      <div className="space-y-2">
                        <div>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="font-medium text-background">
                              {character.name}
                            </span>
                            <span className="rounded-sm bg-background/15 px-1.5 py-0.5 text-[11px] text-background/80">
                              {modelLabel}
                            </span>
                          </div>
                          <div className="mt-1 text-background/80">
                            {formatCount(referencedSceneCount, "引用场景")}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">
                            角色设定
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {character.description || emptyValueText}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">
                            说话方式
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {character.speakingStyle || emptyValueText}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">
                            写作风格
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {character.writingStyle || emptyValueText}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">
                            回复规则
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {character.replyStylePrompt || emptyValueText}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">目标</div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {character.goals || emptyValueText}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-background/90">关系</div>
                          <div className="mt-0.5 whitespace-pre-wrap text-background/80">
                            {relationshipSummary || emptyValueText}
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </div>
                </Tooltip>
              );
            })}
            {localCharacters.length === 0 && (
              <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">
                暂无角色定义。
              </div>
            )}
          </div>
        </TooltipProvider>
      </EditorSection>

      <CharactersEdit
        bind={editRef}
        data={data}
        onSave={onSave}
        modelLabel={modelLabel}
        onRunTextFieldAgent={onRunTextFieldAgent}
      />
    </>
  );
};

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clapperboard,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createTavernScene,
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../../../../../storage";
import type {
  TavernCharacter,
  TavernRoom,
  TavernScene,
} from "../../../../../types";
import {
  EditorSection,
  SceneSummaryLine,
  editorDangerActionButtonClassName,
  editorHeaderActionButtonClassName,
  editorListEntryBodyClassName,
  editorPrimaryActionButtonClassName,
  editorQuietActionButtonClassName,
} from "../../primitives";
import type { PendingDangerAction } from "../../types";
import {
  emptyValueText,
  formatCount,
  getRoomCharacterById,
  getTimelineScopeSummary,
} from "../../utils";
import { ScenesEdit, type ScenesEditHandle } from "./edit";
import type { ModuleEditProps, ModuleSave } from "../types";

type ScenesSectionProps = {
  data: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  onSave: ModuleSave;
  onRequestDangerAction: (action: PendingDangerAction) => void;
  renderTextFieldAgentActions: ModuleEditProps["renderTextFieldAgentActions"];
};

export const ScenesSection = ({
  data,
  characterById,
  onSave,
  onRequestDangerAction,
  renderTextFieldAgentActions,
}: ScenesSectionProps) => {
  const editRef = useRef<ScenesEditHandle>(null);
  const scenes = data.scenes ?? [];
  const roomCharacterById = getRoomCharacterById(data, characterById);

  const saveRoomProjection = (room: TavernRoom) => {
    onSave(projectTavernSceneOntoRoom(room));
  };

  const createScene = () => {
    if (data.locked) {
      return;
    }

    const syncedRoom = syncTavernRoomActiveScene(data);
    const currentScenes = syncedRoom.scenes ?? [];
    const createdAt = Date.now();
    const characterConfigs = Object.fromEntries(
      syncedRoom.characterIds.map((characterId) => [
        characterId,
        {
          characterId,
          memory: syncedRoom.characterConfigs?.[characterId]?.memory,
        },
      ]),
    );
    const scene = createTavernScene({
      title: `阶段 ${currentScenes.length + 1}`,
      order: currentScenes.length,
      scenePresetId: syncedRoom.scenePresetId,
      scene: "新的故事阶段等待配置。",
      sceneGoal: "",
      plot: "",
      storyDirection: "",
      transition: "",
      memory: "",
      characterConfigs,
      characterMemories: {},
      assetDrafts: [],
      characterIds: syncedRoom.characterIds,
      activeCharacterId: syncedRoom.activeCharacterId,
      createdAt,
      updatedAt: createdAt,
    });

    saveRoomProjection({
      ...syncedRoom,
      activeSceneId: scene.id,
      scenes: [...currentScenes, scene],
      updatedAt: createdAt,
    });
  };

  const switchScene = (sceneId: string) => {
    if (!scenes.some((scene) => scene.id === sceneId)) {
      return;
    }

    const syncedRoom = syncTavernRoomActiveScene(data);
    saveRoomProjection({
      ...syncedRoom,
      activeSceneId: sceneId,
    });
  };

  const deleteScene = (sceneId: string) => {
    if (data.locked || scenes.length <= 1) {
      return;
    }

    const syncedRoom = syncTavernRoomActiveScene(data);
    const currentScenes = syncedRoom.scenes ?? [];
    const deletedIndex = currentScenes.findIndex((scene) => scene.id === sceneId);
    if (deletedIndex < 0) {
      return;
    }

    const nextScenes = currentScenes
      .filter((scene) => scene.id !== sceneId)
      .map((scene, index) => ({ ...scene, order: index }));
    const nextActiveSceneId = syncedRoom.activeSceneId === sceneId
      ? nextScenes[Math.min(deletedIndex, nextScenes.length - 1)]?.id ?? nextScenes[0]?.id
      : syncedRoom.activeSceneId;

    saveRoomProjection({
      ...syncedRoom,
      activeSceneId: nextActiveSceneId,
      scenes: nextScenes,
      updatedAt: Date.now(),
    });
  };

  const moveScene = (sceneId: string, direction: -1 | 1) => {
    if (data.locked) {
      return;
    }

    const syncedRoom = syncTavernRoomActiveScene(data);
    const currentScenes = [...(syncedRoom.scenes ?? [])];
    const index = currentScenes.findIndex((scene) => scene.id === sceneId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentScenes.length) {
      return;
    }

    const targetScene = currentScenes[targetIndex];
    currentScenes[targetIndex] = currentScenes[index];
    currentScenes[index] = targetScene;

    saveRoomProjection({
      ...syncedRoom,
      scenes: currentScenes.map((scene, nextIndex) => ({
        ...scene,
        order: nextIndex,
        updatedAt: scene.id === sceneId || scene.id === targetScene.id
          ? Date.now()
          : scene.updatedAt,
      })),
      updatedAt: Date.now(),
    });
  };

  const renderSceneCharacters = (scene: TavernScene) =>
    scene.characterIds
      .map((characterId) => roomCharacterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));

  return (
    <>
      <EditorSection
        className="order-last"
        icon={Clapperboard}
        title="故事场景"
        description="编排同一个大故事中的阶段；酒馆内只会切换这里配置好的场景。"
        meta={formatCount(scenes.length, "阶段")}
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            disabled={data.locked}
            onClick={createScene}
          >
            <Plus className="size-3.5" />
            新增阶段
          </Button>
        )}
        contentClassName="space-y-2"
      >
        <TooltipProvider delayDuration={180}>
          <div className="grid gap-2">
            {scenes.map((scene, index) => {
              const isActiveScene = scene.id === data.activeSceneId;
              const sceneCharacters = renderSceneCharacters(scene);
              const sceneTitle = scene.title || `阶段 ${index + 1}`;

              return (
                <div
                  key={scene.id}
                  className={cn(
                    "rounded-md border bg-background/80 p-3",
                    isActiveScene && "border-primary/45 bg-primary/[0.06] ring-1 ring-primary/10",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <div className="min-w-0 truncate text-sm font-medium leading-5">
                              {sceneTitle}
                            </div>
                            {isActiveScene && <Badge variant="secondary">默认</Badge>}
                          </div>
                          <div className={cn("mt-1 line-clamp-2", editorListEntryBodyClassName)}>
                            {scene.plot.trim() || scene.scene.trim() || emptyValueText}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              tabIndex={0}
                              className="flex max-w-[14rem] shrink-0 cursor-default items-center gap-1.5 rounded-md bg-muted/35 px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-xs"
                            >
                              <div className="flex -space-x-1.5">
                                {sceneCharacters.map((character) => (
                                  <img
                                    key={character.id}
                                    src={resolveAgentAvatar(character.avatar).src}
                                    alt=""
                                    className="size-6 rounded-full border bg-muted"
                                  />
                                ))}
                                {sceneCharacters.length === 0 && (
                                  <span className="flex size-6 items-center justify-center rounded-full border bg-background text-[11px] text-muted-foreground">
                                    0
                                  </span>
                                )}
                              </div>
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatCount(sceneCharacters.length, "角色")}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-xs p-3 text-left">
                            <div className="space-y-2">
                              <div className="font-medium text-background">场景角色</div>
                              {sceneCharacters.length > 0 ? (
                                sceneCharacters.map((character) => (
                                  <div key={character.id} className="flex min-w-0 gap-2">
                                    <img
                                      src={resolveAgentAvatar(character.avatar).src}
                                      alt=""
                                      className="size-7 rounded-md border border-background/20 bg-background/10"
                                    />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-background">
                                        {character.name}
                                      </div>
                                      <div className="line-clamp-2 text-xs leading-5 text-background/75">
                                        {character.speakingStyle || emptyValueText}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-background/75">暂无引用角色</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="mt-3 grid gap-1.5">
                        <SceneSummaryLine label="场景描述" value={scene.scene} />
                        <SceneSummaryLine label="阶段剧情" value={scene.plot} />
                        <SceneSummaryLine label="场景目标" value={scene.sceneGoal} />
                        <SceneSummaryLine label="剧情走向" value={scene.storyDirection} />
                        <SceneSummaryLine label="承接关系" value={scene.transition} />
                        <SceneSummaryLine label="阶段记忆" value={scene.memory} />
                        <SceneSummaryLine
                          label="时间线范围"
                          value={getTimelineScopeSummary(scene.timelineScope, data.timelineEvents)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t pt-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorQuietActionButtonClassName}
                      disabled={data.locked || index === 0}
                      onClick={() => moveScene(scene.id, -1)}
                    >
                      <ArrowUp className="size-3" />
                      上移
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorQuietActionButtonClassName}
                      disabled={data.locked || index === scenes.length - 1}
                      onClick={() => moveScene(scene.id, 1)}
                    >
                      <ArrowDown className="size-3" />
                      下移
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={isActiveScene
                        ? editorPrimaryActionButtonClassName
                        : editorQuietActionButtonClassName}
                      disabled={isActiveScene}
                      onClick={() => switchScene(scene.id)}
                    >
                      <CheckCircle2 className="size-3" />
                      设为默认
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className={editorPrimaryActionButtonClassName}
                      aria-label={`编辑${sceneTitle}叙事`}
                      onClick={() => editRef.current?.(scene.id)}
                    >
                      <Pencil className="size-3" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className={editorDangerActionButtonClassName}
                      disabled={data.locked || scenes.length <= 1}
                      onClick={() => {
                        const sceneLabel = scene.title.trim() || `阶段 ${index + 1}`;
                        onRequestDangerAction({
                          title: "删除故事阶段",
                          description:
                            `删除「${sceneLabel}」？确认后该阶段的剧情配置和对话历史会立即移除。`,
                          confirmLabel: "删除阶段",
                          onConfirm: () => deleteScene(scene.id),
                        });
                      }}
                    >
                      <Trash2 className="size-3" />
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </EditorSection>

      <ScenesEdit
        bind={editRef}
        data={data}
        onSave={onSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
        roomCharacterById={roomCharacterById}
      />
    </>
  );
};

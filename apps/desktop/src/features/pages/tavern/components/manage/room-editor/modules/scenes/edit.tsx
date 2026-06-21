import {
  BookOpenText,
  Clapperboard,
  FileText,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import { getActiveTavernScene } from "../../../../../storage";
import type {
  TavernCharacter,
  TavernRelationshipTarget,
  TavernRoomCharacterConfig,
  TavernScene,
  TavernSceneRelationshipOverride,
  TavernTimelineScope,
} from "../../../../../types";
import {
  EditorField,
  EditorFormCard,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorFormNav,
  EditorFormSidebarCard,
  EditorFormSidebarPanel,
  EditorStatusPill,
} from "../../primitives";
import {
  cloneRoomCharacterConfigs,
  cloneTimelineScope,
  editorControlClassName,
  emptyValueText,
  getTimelineEventLabel,
} from "../../utils";
import type { ModuleEditProps } from "../types";

export type ScenesEditHandle = (sceneId: string) => void;

type ScenesDraft = {
  sceneId: string;
  sceneTitle: string;
  scene: string;
  sceneGoal: string;
  scenePlot: string;
  sceneDirection: string;
  sceneTransition: string;
  timelineScope: TavernTimelineScope;
  memory: string;
  relationshipOverrides: TavernSceneRelationshipOverride[];
  characterIds: string[];
  activeCharacterId: string;
  characterConfigs: Record<string, TavernRoomCharacterConfig>;
  characterMemories: Record<string, string>;
};

type ScenesEditProps = ModuleEditProps & {
  bind: Ref<ScenesEditHandle>;
  roomCharacterById: Map<string, TavernCharacter>;
};

export const ScenesEdit = ({
  bind,
  data,
  onSave,
  renderTextFieldAgentActions,
  roomCharacterById,
}: ScenesEditProps) => {
  const [draft, setDraft] = useState<ScenesDraft | null>(null);
  const [error, setError] = useState("");

  const open = (sceneId: string) => {
    const scene = data.scenes?.find((item) => item.id === sceneId)
      ?? getActiveTavernScene(data);
    if (!scene) {
      return;
    }

    setError("");
    setDraft({
      sceneId: scene.id,
      sceneTitle: scene.title,
      scene: scene.scene,
      sceneGoal: scene.sceneGoal,
      scenePlot: scene.plot,
      sceneDirection: scene.storyDirection,
      sceneTransition: scene.transition,
      timelineScope: cloneTimelineScope(scene.timelineScope),
      memory: scene.memory,
      relationshipOverrides: scene.relationshipOverrides.map((relationship) => ({
        ...relationship,
        tags: [...relationship.tags],
      })),
      characterIds: [...scene.characterIds],
      activeCharacterId: scene.activeCharacterId,
      characterConfigs: cloneRoomCharacterConfigs(scene.characterConfigs),
      characterMemories: { ...scene.characterMemories },
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const isEditedSceneActive = draft.sceneId === data.activeSceneId;
    const updatedAt = Date.now();
    const validCharacterIds = new Set(roomCharacterById.keys());
    const nextCharacterIds = Array.from(new Set(
      draft.characterIds.filter((characterId) => validCharacterIds.has(characterId)),
    ));
    if ((data.localCharacters?.length ?? 0) > 0 && nextCharacterIds.length === 0) {
      setError("请至少为场景引用一个角色。");
      return;
    }

    const nextActiveCharacterId = nextCharacterIds.includes(draft.activeCharacterId)
      ? draft.activeCharacterId
      : nextCharacterIds[0] ?? "";
    const nextCharacterConfigs: Record<string, TavernRoomCharacterConfig> = Object.fromEntries(
      nextCharacterIds.map((characterId) => {
        const sourceConfig = draft.characterConfigs[characterId] ?? { characterId };
        const memory = (
          draft.characterMemories[characterId]
          ?? sourceConfig.memory
          ?? ""
        ).trim();
        return [
          characterId,
          {
            characterId,
            memory: memory || undefined,
          },
        ];
      }),
    );
    const nextCharacterMemories = Object.fromEntries(
      Object.entries(nextCharacterConfigs).flatMap(([characterId, config]) => {
        const memory = config.memory?.trim() ?? "";
        return memory ? [[characterId, memory]] : [];
      }),
    );
    const nextRelationshipOverrides = draft.relationshipOverrides.flatMap((relationship) => {
      if (!nextCharacterIds.includes(relationship.subjectCharacterId)) {
        return [];
      }
      if (
        relationship.target.type === "character" &&
        !nextCharacterIds.includes(relationship.target.characterId)
      ) {
        return [];
      }

      const label = relationship.label?.trim() || undefined;
      const publicNote = relationship.publicNote?.trim() || undefined;
      const privateNote = relationship.privateNote?.trim() || undefined;
      const tags = relationship.tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
      if (!label && !publicNote && !privateNote && tags.length === 0) {
        return [];
      }
      return [{
        ...relationship,
        label,
        publicNote,
        privateNote,
        tags,
        updatedAt,
      }];
    });

    const updateScene = (scene: TavernScene) =>
      scene.id === draft.sceneId
        ? {
            ...scene,
            title: draft.sceneTitle.trim() || "默认场景",
            scene: draft.scene,
            sceneGoal: draft.sceneGoal,
            plot: draft.scenePlot,
            storyDirection: draft.sceneDirection,
            transition: draft.sceneTransition,
            timelineScope: cloneTimelineScope(draft.timelineScope),
            memory: draft.memory,
            relationshipOverrides: nextRelationshipOverrides,
            characterIds: nextCharacterIds,
            activeCharacterId: nextActiveCharacterId,
            characterConfigs: nextCharacterConfigs,
            characterMemories: nextCharacterMemories,
            updatedAt,
          }
        : scene;

    onSave({
      ...(isEditedSceneActive
        ? {
            scene: draft.scene,
            sceneGoal: draft.sceneGoal,
            scenePlot: draft.scenePlot,
            sceneDirection: draft.sceneDirection,
            sceneTransition: draft.sceneTransition,
            memory: draft.memory,
            relationshipOverrides: nextRelationshipOverrides,
            characterIds: nextCharacterIds,
            activeCharacterId: nextActiveCharacterId,
            characterConfigs: nextCharacterConfigs,
            characterMemories: nextCharacterMemories,
          }
        : {}),
      scenes: data.scenes?.map(updateScene),
    });
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
      {draft && (
        <EditorFormDialogContent className="sm:max-w-6xl">
          <EditorFormHeader
            icon={Clapperboard}
            title="编辑故事阶段"
            description="修改当前故事阶段的描述、剧情、目标、走向、记忆和出场角色。"
          />

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={(
                <>
                  <EditorFormSidebarCard
                    icon={Clapperboard}
                    title={draft.sceneTitle.trim() || "默认场景"}
                    meta={(
                      <>
                        <EditorStatusPill tone="active">
                          {TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === data.scenePresetId)?.label ?? "场景"}
                        </EditorStatusPill>
                        <EditorStatusPill>
                          {draft.characterIds.length} 角色
                        </EditorStatusPill>
                      </>
                    )}
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.scene.trim() || "还没有填写场景描述。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="阶段目标">
                    <p className="line-clamp-4 text-sm leading-5 text-muted-foreground">
                      {draft.sceneGoal.trim() || emptyValueText}
                    </p>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-scenes-content-section", icon: FileText, label: "阶段内容" },
                      { href: "#tavern-scenes-memory-section", icon: BookOpenText, label: "阶段记忆" },
                      { href: "#tavern-scenes-characters-section", icon: UsersRound, label: "出场角色" },
                    ]}
                  />
                </>
              )}
            >
              <div className="space-y-3">
                <EditorFormCard
                  id="tavern-scenes-content-section"
                  icon={FileText}
                  title="阶段内容"
                  description="定义阶段基础信息、场景描述、剧情目标和时间线范围。"
                >
                  <div className="space-y-3">
                <EditorField label="当前阶段名称" htmlFor="tavern-scenes-title">
                  <Input
                    id="tavern-scenes-title"
                    value={draft.sceneTitle}
                    className={editorControlClassName}
                    onChange={(event) => setDraft({
                      ...draft,
                      sceneTitle: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="场景描述"
                  htmlFor="tavern-scenes-scene"
                  action={renderTextFieldAgentActions({
                    fieldKey: "scene",
                    fieldLabel: "场景描述",
                    currentText: draft.scene,
                    applyText: (text) => setDraft({ ...draft, scene: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-scene"
                    value={draft.scene}
                    className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      scene: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="阶段剧情"
                  htmlFor="tavern-scenes-plot"
                  action={renderTextFieldAgentActions({
                    fieldKey: "scenePlot",
                    fieldLabel: "阶段剧情",
                    currentText: draft.scenePlot,
                    applyText: (text) => setDraft({ ...draft, scenePlot: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-plot"
                    value={draft.scenePlot}
                    className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      scenePlot: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="场景目标"
                  htmlFor="tavern-scenes-goal"
                  action={renderTextFieldAgentActions({
                    fieldKey: "sceneGoal",
                    fieldLabel: "场景目标",
                    currentText: draft.sceneGoal,
                    applyText: (text) => setDraft({ ...draft, sceneGoal: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-goal"
                    value={draft.sceneGoal}
                    className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      sceneGoal: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="剧情走向"
                  htmlFor="tavern-scenes-direction"
                  action={renderTextFieldAgentActions({
                    fieldKey: "sceneDirection",
                    fieldLabel: "剧情走向",
                    currentText: draft.sceneDirection,
                    applyText: (text) => setDraft({ ...draft, sceneDirection: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-direction"
                    value={draft.sceneDirection}
                    className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      sceneDirection: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="承接关系"
                  htmlFor="tavern-scenes-transition"
                  action={renderTextFieldAgentActions({
                    fieldKey: "sceneTransition",
                    fieldLabel: "承接关系",
                    currentText: draft.sceneTransition,
                    applyText: (text) => setDraft({ ...draft, sceneTransition: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-transition"
                    value={draft.sceneTransition}
                    className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      sceneTransition: event.target.value,
                    })}
                  />
                </EditorField>

                <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
                  <EditorField label="时间线范围" htmlFor="tavern-scenes-timeline-scope">
                    <NativeSelect
                      id="tavern-scenes-timeline-scope"
                      value={draft.timelineScope.mode}
                      className={editorControlClassName}
                      onChange={(event) => {
                        const mode = event.target.value as TavernTimelineScope["mode"];
                        setDraft({
                          ...draft,
                          timelineScope: mode === "range"
                            ? { mode: "range" }
                            : mode === "selected"
                            ? { mode: "selected", eventIds: [] }
                            : { mode: "auto" },
                        });
                      }}
                    >
                      <NativeSelectOption value="auto">自动</NativeSelectOption>
                      <NativeSelectOption value="range">起止范围</NativeSelectOption>
                      <NativeSelectOption value="selected">精选事件</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>

                  {draft.timelineScope.mode === "range" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <EditorField label="起点事件" htmlFor="tavern-scenes-timeline-start">
                        <NativeSelect
                          id="tavern-scenes-timeline-start"
                          value={draft.timelineScope.startEventId ?? ""}
                          className={editorControlClassName}
                          onChange={(event) => setDraft({
                            ...draft,
                            timelineScope: {
                              ...draft.timelineScope,
                              mode: "range",
                              startEventId: event.target.value || undefined,
                            },
                          })}
                        >
                          <NativeSelectOption value="">从第一条</NativeSelectOption>
                          {data.timelineEvents.map((event, index) => (
                            <NativeSelectOption key={event.id} value={event.id}>
                              {getTimelineEventLabel(event, index)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </EditorField>
                      <EditorField label="终点事件" htmlFor="tavern-scenes-timeline-end">
                        <NativeSelect
                          id="tavern-scenes-timeline-end"
                          value={draft.timelineScope.endEventId ?? ""}
                          className={editorControlClassName}
                          onChange={(event) => setDraft({
                            ...draft,
                            timelineScope: {
                              ...draft.timelineScope,
                              mode: "range",
                              endEventId: event.target.value || undefined,
                            },
                          })}
                        >
                          <NativeSelectOption value="">到最后一条</NativeSelectOption>
                          {data.timelineEvents.map((event, index) => (
                            <NativeSelectOption key={event.id} value={event.id}>
                              {getTimelineEventLabel(event, index)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </EditorField>
                    </div>
                  )}

                  {draft.timelineScope.mode === "selected" && (
                    <div className="space-y-2">
                      {data.timelineEvents.length > 0 ? (
                        data.timelineEvents.map((event, index) => {
                          const selectedEventIds = draft.timelineScope.eventIds ?? [];
                          const isSelected = selectedEventIds.includes(event.id);

                          return (
                            <label
                              key={event.id}
                              className="flex items-start gap-2 rounded-md border bg-background/70 px-3 py-2"
                              htmlFor={`tavern-scenes-timeline-event-${event.id}`}
                            >
                              <input
                                id={`tavern-scenes-timeline-event-${event.id}`}
                                type="checkbox"
                                checked={isSelected}
                                className="mt-1 size-4"
                                onChange={(eventChange) => setDraft({
                                  ...draft,
                                  timelineScope: {
                                    mode: "selected",
                                    eventIds: eventChange.target.checked
                                      ? [...selectedEventIds, event.id]
                                      : selectedEventIds.filter((eventId) => eventId !== event.id),
                                  },
                                })}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium leading-5">
                                  {getTimelineEventLabel(event, index)}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                                  {event.summary}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="rounded-md border bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                          暂无共享剧情事件。
                        </div>
                      )}
                    </div>
                  )}
                </div>
                  </div>
                </EditorFormCard>

                <EditorFormCard
                  id="tavern-scenes-memory-section"
                  icon={BookOpenText}
                  title="阶段记忆"
                  description="保存本阶段长期可被承接的事实和状态。"
                >
                <EditorField
                  label="阶段记忆"
                  htmlFor="tavern-scenes-memory"
                  action={renderTextFieldAgentActions({
                    fieldKey: "sceneMemory",
                    fieldLabel: "阶段记忆",
                    currentText: draft.memory,
                    applyText: (text) => setDraft({ ...draft, memory: text }),
                  })}
                >
                  <Textarea
                    id="tavern-scenes-memory"
                    value={draft.memory}
                    className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      memory: event.target.value,
                    })}
                  />
                </EditorField>
                </EditorFormCard>

                <EditorFormCard
                  id="tavern-scenes-characters-section"
                  icon={UsersRound}
                  title="出场角色"
                  description="添加本阶段需要出场的角色，并维护只在本场景生效的角色记忆。"
                >
                {(() => {
                  const availableSceneRoleDefinitions = data.localCharacters ?? [];
                  const availableSceneRoleIds = new Set(
                    availableSceneRoleDefinitions.map((character) => character.id),
                  );
                  const selectedCharacterIds = new Set(draft.characterIds);
                  const selectedSceneRoleDefinitions = draft.characterIds
                    .map((characterId) => roomCharacterById.get(characterId))
                    .filter((character): character is TavernCharacter => Boolean(character));
                  const addableSceneRoleDefinitions = availableSceneRoleDefinitions.filter(
                    (character) => !selectedCharacterIds.has(character.id),
                  );
                  const targetToValue = (target: TavernRelationshipTarget) =>
                    target.type === "user" ? "user" : `character:${target.characterId}`;
                  const targetFromValue = (value: string): TavernRelationshipTarget => {
                    if (value.startsWith("character:")) {
                      return {
                        type: "character",
                        characterId: value.replace(/^character:/, ""),
                      };
                    }
                    return { type: "user" };
                  };
                  const relationshipTargetOptions = (subjectCharacterId: string) => [
                    {
                      value: "user",
                      label: "用户",
                    },
                    ...selectedSceneRoleDefinitions
                      .filter((character) => character.id !== subjectCharacterId)
                      .map((character) => ({
                        value: `character:${character.id}`,
                        label: character.name,
                      })),
                  ];
                  const updateRelationshipOverride = (
                    relationshipId: string,
                    patch: Partial<TavernSceneRelationshipOverride>,
                  ) => {
                    setDraft({
                      ...draft,
                      relationshipOverrides: draft.relationshipOverrides.map((relationship) =>
                        relationship.id === relationshipId
                          ? {
                              ...relationship,
                              ...patch,
                              updatedAt: Date.now(),
                            }
                          : relationship
                      ),
                    });
                  };
                  const createRelationshipOverrideDraft = (): TavernSceneRelationshipOverride => {
                    const subjectCharacterId = draft.activeCharacterId || draft.characterIds[0] || "";
                    const targetOption = relationshipTargetOptions(subjectCharacterId)[0];
                    return {
                      id: `scene-relationship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                      subjectCharacterId,
                      target: targetFromValue(targetOption?.value ?? "user"),
                      label: "",
                      publicNote: "",
                      privateNote: "",
                      tags: [],
                      updatedAt: Date.now(),
                    };
                  };
                  const addSceneCharacter = (character: TavernCharacter) => {
                    const nextCharacterConfigs = {
                      ...draft.characterConfigs,
                      [character.id]: draft.characterConfigs[character.id] ?? {
                        characterId: character.id,
                      },
                    };
                    setDraft({
                      ...draft,
                      characterIds: Array.from(new Set([
                        ...draft.characterIds,
                        character.id,
                      ])),
                      activeCharacterId: draft.activeCharacterId || character.id,
                      characterConfigs: nextCharacterConfigs,
                    });
                  };
                  const removeSceneCharacter = (characterId: string) => {
                    if (draft.characterIds.length <= 1) {
                      return;
                    }

                    const nextCharacterIds = draft.characterIds.filter((id) => id !== characterId);
                    const nextCharacterConfigs = { ...draft.characterConfigs };
                    const nextCharacterMemories = { ...draft.characterMemories };
                    delete nextCharacterConfigs[characterId];
                    delete nextCharacterMemories[characterId];
                    setDraft({
                      ...draft,
                      characterIds: nextCharacterIds,
                      activeCharacterId: draft.activeCharacterId === characterId
                        ? nextCharacterIds[0] ?? ""
                        : draft.activeCharacterId,
                      characterConfigs: nextCharacterConfigs,
                      characterMemories: nextCharacterMemories,
                      relationshipOverrides: draft.relationshipOverrides.filter((relationship) =>
                        relationship.subjectCharacterId !== characterId &&
                        (
                          relationship.target.type !== "character" ||
                          relationship.target.characterId !== characterId
                        )
                      ),
                    });
                  };

                  return (
                    <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium leading-5">场景引用角色</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            添加本阶段需要出场的角色，并维护角色只在本场景生效的记忆。
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={addableSceneRoleDefinitions.length === 0}
                            >
                              <Plus className="size-3.5" />
                              添加角色
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>可添加角色</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {addableSceneRoleDefinitions.map((character) => (
                              <DropdownMenuItem
                                key={character.id}
                                className="items-start gap-2"
                                onSelect={() => addSceneCharacter(character)}
                              >
                                <img
                                  src={resolveAgentAvatar(character.avatar).src}
                                  alt=""
                                  className="mt-0.5 size-7 rounded-md border bg-muted/20"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm">{character.name}</span>
                                  <span className="line-clamp-1 block text-xs text-muted-foreground">
                                    {character.speakingStyle || emptyValueText}
                                  </span>
                                </span>
                              </DropdownMenuItem>
                            ))}
                            {addableSceneRoleDefinitions.length === 0 && (
                              <DropdownMenuItem disabled>暂无可添加角色</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {availableSceneRoleDefinitions.length > 0 || selectedSceneRoleDefinitions.length > 0 ? (
                        <div className="space-y-2">
                          {selectedSceneRoleDefinitions.map((character) => {
                            const isActiveCharacter = draft.activeCharacterId === character.id;
                            const characterConfig = draft.characterConfigs[character.id] ?? {
                              characterId: character.id,
                            };
                            const characterMemory = draft.characterMemories[character.id]
                              ?? characterConfig.memory
                              ?? "";

                            return (
                              <div
                                key={character.id}
                                className="space-y-3 rounded-md border border-primary/25 bg-background/80 p-3"
                              >
                                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2.5">
                                  <img
                                    src={resolveAgentAvatar(character.avatar).src}
                                    alt=""
                                    className="size-10 rounded-md border bg-muted/20"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <div className="min-w-0 truncate text-sm font-medium leading-5">
                                        {character.name}
                                      </div>
                                      {!availableSceneRoleIds.has(character.id) && (
                                        <Badge variant="secondary">外部角色</Badge>
                                      )}
                                      {isActiveCharacter && <Badge variant="outline">默认</Badge>}
                                    </div>
                                    <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                      {character.speakingStyle || emptyValueText}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant={isActiveCharacter ? "secondary" : "outline"}
                                      disabled={isActiveCharacter}
                                      onClick={() => setDraft({
                                        ...draft,
                                        activeCharacterId: character.id,
                                      })}
                                    >
                                      设为默认
                                    </Button>
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="ghost"
                                      disabled={draft.characterIds.length <= 1}
                                      onClick={() => removeSceneCharacter(character.id)}
                                    >
                                      移除
                                    </Button>
                                  </div>
                                </div>

                                <div className="border-t pt-3">
                                  <EditorField
                                    label="角色场景记忆"
                                    htmlFor={`tavern-scenes-character-memory-${character.id}`}
                                  >
                                    <Textarea
                                      id={`tavern-scenes-character-memory-${character.id}`}
                                      value={characterMemory}
                                      className={cn("min-h-[96px] resize-none text-sm leading-6", editorControlClassName)}
                                      onChange={(event) => {
                                        const nextMemory = event.target.value;
                                        setDraft({
                                          ...draft,
                                          characterMemories: {
                                            ...draft.characterMemories,
                                            [character.id]: nextMemory,
                                          },
                                          characterConfigs: {
                                            ...draft.characterConfigs,
                                            [character.id]: {
                                              ...characterConfig,
                                              memory: nextMemory.trim() || undefined,
                                            },
                                          },
                                        });
                                      }}
                                    />
                                  </EditorField>
                                </div>
                              </div>
                            );
                          })}
                          {selectedSceneRoleDefinitions.length === 0 && (
                            <div className="rounded-md border border-dashed bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                              暂未引用角色。点击“添加角色”加入本阶段需要的角色。
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-md border bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                          暂无角色定义。请先在酒馆角色库中新建角色。
                        </div>
                      )}

                      <div className="space-y-3 border-t pt-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium leading-5">本场景关系修正</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              只描述当前阶段内发生偏移的关系，不覆盖角色库里的长期基础关系。
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={selectedSceneRoleDefinitions.length === 0}
                            onClick={() => setDraft({
                              ...draft,
                              relationshipOverrides: [
                                ...draft.relationshipOverrides,
                                createRelationshipOverrideDraft(),
                              ],
                            })}
                          >
                            <Plus className="size-3.5" />
                            添加修正
                          </Button>
                        </div>

                        {draft.relationshipOverrides.length > 0 ? (
                          <div className="space-y-2">
                            {draft.relationshipOverrides.map((relationship) => {
                              const subjectOptions = selectedSceneRoleDefinitions.map((character) => ({
                                value: character.id,
                                label: character.name,
                              }));
                              const targetOptions = relationshipTargetOptions(relationship.subjectCharacterId);
                              const targetValue = targetOptions.some((option) =>
                                option.value === targetToValue(relationship.target)
                              )
                                ? targetToValue(relationship.target)
                                : "user";

                              return (
                                <div
                                  key={relationship.id}
                                  className="space-y-3 rounded-md border border-border/70 bg-background/80 p-3"
                                >
                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                                    <EditorField
                                      label="发起角色"
                                      htmlFor={`tavern-scenes-relationship-subject-${relationship.id}`}
                                      className="min-w-0"
                                    >
                                      <NativeSelect
                                        id={`tavern-scenes-relationship-subject-${relationship.id}`}
                                        className="w-full"
                                        value={relationship.subjectCharacterId}
                                        onChange={(event) => {
                                          const subjectCharacterId = event.target.value;
                                          const nextTargetOptions = relationshipTargetOptions(subjectCharacterId);
                                          const currentTargetValue = targetToValue(relationship.target);
                                          updateRelationshipOverride(relationship.id, {
                                            subjectCharacterId,
                                            target: targetFromValue(
                                              nextTargetOptions.some((option) => option.value === currentTargetValue)
                                                ? currentTargetValue
                                                : "user",
                                            ),
                                          });
                                        }}
                                      >
                                        {subjectOptions.map((option) => (
                                          <NativeSelectOption key={option.value} value={option.value}>
                                            {option.label}
                                          </NativeSelectOption>
                                        ))}
                                      </NativeSelect>
                                    </EditorField>
                                    <EditorField
                                      label="关系对象"
                                      htmlFor={`tavern-scenes-relationship-target-${relationship.id}`}
                                      className="min-w-0"
                                    >
                                      <NativeSelect
                                        id={`tavern-scenes-relationship-target-${relationship.id}`}
                                        className="w-full"
                                        value={targetValue}
                                        onChange={(event) => updateRelationshipOverride(relationship.id, {
                                          target: targetFromValue(event.target.value),
                                        })}
                                      >
                                        {targetOptions.map((option) => (
                                          <NativeSelectOption key={option.value} value={option.value}>
                                            {option.label}
                                          </NativeSelectOption>
                                        ))}
                                      </NativeSelect>
                                    </EditorField>
                                    <EditorField
                                      label="修正标签"
                                      htmlFor={`tavern-scenes-relationship-label-${relationship.id}`}
                                    >
                                      <Input
                                        id={`tavern-scenes-relationship-label-${relationship.id}`}
                                        value={relationship.label ?? ""}
                                        placeholder="恶化、暂时联手、起疑"
                                        className={editorControlClassName}
                                        onChange={(event) => updateRelationshipOverride(relationship.id, {
                                          label: event.target.value,
                                        })}
                                      />
                                    </EditorField>
                                    <Button
                                      type="button"
                                      size="icon-xs"
                                      variant="ghost"
                                      className="self-end"
                                      title="删除关系修正"
                                      aria-label="删除关系修正"
                                      onClick={() => setDraft({
                                        ...draft,
                                        relationshipOverrides: draft.relationshipOverrides.filter((item) =>
                                          item.id !== relationship.id
                                        ),
                                      })}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
                                    <EditorField
                                      label="明面修正"
                                      htmlFor={`tavern-scenes-relationship-public-${relationship.id}`}
                                    >
                                      <Textarea
                                        id={`tavern-scenes-relationship-public-${relationship.id}`}
                                        value={relationship.publicNote ?? ""}
                                        className={cn("min-h-[72px] resize-none text-sm leading-6", editorControlClassName)}
                                        onChange={(event) => updateRelationshipOverride(relationship.id, {
                                          publicNote: event.target.value,
                                        })}
                                      />
                                    </EditorField>
                                    <EditorField
                                      label="私下修正"
                                      htmlFor={`tavern-scenes-relationship-private-${relationship.id}`}
                                    >
                                      <Textarea
                                        id={`tavern-scenes-relationship-private-${relationship.id}`}
                                        value={relationship.privateNote ?? ""}
                                        className={cn("min-h-[72px] resize-none text-sm leading-6", editorControlClassName)}
                                        onChange={(event) => updateRelationshipOverride(relationship.id, {
                                          privateNote: event.target.value,
                                        })}
                                      />
                                    </EditorField>
                                    <EditorField
                                      label="标签"
                                      htmlFor={`tavern-scenes-relationship-tags-${relationship.id}`}
                                    >
                                      <Input
                                        id={`tavern-scenes-relationship-tags-${relationship.id}`}
                                        value={relationship.tags.join("、")}
                                        placeholder="逗号或顿号分隔"
                                        className={editorControlClassName}
                                        onChange={(event) => updateRelationshipOverride(relationship.id, {
                                          tags: event.target.value
                                            .split(/[，,、]/u)
                                            .map((tag) => tag.trim())
                                            .filter(Boolean),
                                        })}
                                      />
                                    </EditorField>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                            暂无场景关系修正。
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                </EditorFormCard>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter status="保存后会立即更新当前故事阶段。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存修改
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};

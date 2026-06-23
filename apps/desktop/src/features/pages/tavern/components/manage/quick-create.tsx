import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Sparkles,
} from "lucide-react";
import type { FormEvent, MouseEvent, Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TAVERN_PRESENTATION_PROFILE_OPTIONS,
  normalizeTavernPresentationProfileId,
} from "../../prompt-registry/presentation-rules";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  normalizeTavernPromptStyleId,
} from "../../prompt-styles";
import {
  TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS,
  normalizeTavernSystemNarrativePresetId,
} from "../../prompt-registry/system-narrative-styles";
import {
  TAVERN_RULE_COMPOSITION_OPTIONS,
  normalizeTavernRuleCompositionId,
  resolveTavernPromptRuleStack,
} from "../../prompt-registry/rule-layers/resolver";
import type { TavernTextFieldAgentRequest } from "../../runtime/assistants";
import type { TavernGeneratedPresetAgentDraft } from "../../runtime/assistants";
import type {
  TavernRoom,
  TavernRoomSettings,
} from "../../types";
import { EditorField } from "./room-editor/primitives";
import {
  applyInformationPolicyModePreset,
  editorControlClassName,
  getUnknownErrorMessage,
} from "./room-editor/utils";

export type QuickCreateHandle = () => void;

type QuickCreateProps = {
  bind: Ref<QuickCreateHandle>;
  rooms: TavernRoom[];
  activeRoom: TavernRoom;
  onQuickCreateRoom: (draft: TavernGeneratedPresetAgentDraft) => Promise<string | null>;
  onRunTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
  onOperationStatusChange: (status: string) => void;
};

type QuickCreateRoomDraft = {
  title: string;
  premise: string;
  background: string;
  worldInfo: string;
  storyGoal: string;
  userPersonaName: string;
  presentationProfileId: string;
  promptStyleId: string;
  systemNarrativePresetId: string;
  platformStyleId: string;
  informationMode: TavernRoomSettings["informationPolicy"]["mode"];
  characterSeeds: string;
  characterCount: string;
  statusTrackingEnabled: boolean;
  randomEventsEnabled: boolean;
  randomEventProbability: string;
  illustrationHintsEnabled: boolean;
  advancedOpen: boolean;
};

const createEmptyQuickCreateRoomDraft = (): QuickCreateRoomDraft => ({
  title: "",
  premise: "",
  background: "",
  worldInfo: "",
  storyGoal: "",
  userPersonaName: "我",
  presentationProfileId: "dialogue-chat",
  promptStyleId: "novel",
  systemNarrativePresetId: "balanced",
  platformStyleId: "none",
  informationMode: "open",
  characterSeeds: "",
  characterCount: "3",
  statusTrackingEnabled: true,
  randomEventsEnabled: false,
  randomEventProbability: "15",
  illustrationHintsEnabled: false,
  advancedOpen: false,
});

const parseQuickCreateCharacterSeeds = (value: string) =>
  value.split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => {
      const parts = line.split(/[:：\-—]/);
      const name = parts[0]?.trim() ?? "";
      const description = parts.slice(1).join(" - ").trim();
      return {
        name: name || undefined,
        description: description || line,
      };
    });

const clampQuickCreateInteger = (
  value: string,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const clampQuickCreateProbability = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.15;
  }

  return Math.min(1, Math.max(0, parsed / 100));
};

export const QuickCreate = ({
  bind,
  rooms,
  activeRoom,
  onQuickCreateRoom,
  onRunTextFieldAgent,
  onOperationStatusChange,
}: QuickCreateProps) => {
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateDraft, setQuickCreateDraft] = useState<QuickCreateRoomDraft>(
    createEmptyQuickCreateRoomDraft,
  );
  const [quickCreateError, setQuickCreateError] = useState("");
  const [isQuickCreatingRoom, setIsQuickCreatingRoom] = useState(false);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");

  const open = () => {
    setQuickCreateDraft(createEmptyQuickCreateRoomDraft());
    setQuickCreateError("");
    setIsQuickCreateOpen(true);
  };

  useImperativeHandle(bind, () => open);

  const closeQuickCreateDialog = () => {
    if (isQuickCreatingRoom) {
      return;
    }

    setIsQuickCreateOpen(false);
    setQuickCreateError("");
  };

  const submitQuickCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = quickCreateDraft.title.trim();
    const premise = quickCreateDraft.premise.trim();
    if (!title && !premise) {
      setQuickCreateError("请至少填写标题或核心设想。");
      return;
    }

    setIsQuickCreatingRoom(true);
    setQuickCreateError("");
    const characterCount = clampQuickCreateInteger(quickCreateDraft.characterCount, 3, 1, 8);
    const randomEventProbability = clampQuickCreateProbability(
      quickCreateDraft.randomEventProbability,
    );
    const informationPolicy = applyInformationPolicyModePreset(
      quickCreateDraft.informationMode,
      activeRoom.settings.informationPolicy,
    );
    const error = await onQuickCreateRoom({
      title,
      premise,
      background: quickCreateDraft.background.trim(),
      worldInfo: quickCreateDraft.worldInfo.trim(),
      storyGoal: quickCreateDraft.storyGoal.trim(),
      userPersonaName: quickCreateDraft.userPersonaName.trim() || "我",
      presentationProfileId: normalizeTavernPresentationProfileId(
        quickCreateDraft.presentationProfileId,
      ),
      promptStyleId: normalizeTavernPromptStyleId(quickCreateDraft.promptStyleId),
      promptSeed: {
        systemNarrativePresetId: normalizeTavernSystemNarrativePresetId(
          quickCreateDraft.systemNarrativePresetId,
        ),
        ruleCompositionId: normalizeTavernRuleCompositionId(
          quickCreateDraft.platformStyleId,
        ),
      },
      characterSeeds: parseQuickCreateCharacterSeeds(quickCreateDraft.characterSeeds),
      advanced: {
        characterCount,
        enableStatusTracking: quickCreateDraft.statusTrackingEnabled,
        enableRandomEvents: quickCreateDraft.randomEventsEnabled,
        randomEventProbability,
        enableIllustrationHints: quickCreateDraft.illustrationHintsEnabled,
        settings: {
          directorMaxSpeakers: Math.min(4, Math.max(1, characterCount)),
          statusTracking: {
            enabled: quickCreateDraft.statusTrackingEnabled,
            visibleToUser: true,
          },
          randomEvents: {
            enabled: quickCreateDraft.randomEventsEnabled,
            probability: randomEventProbability,
          },
          illustrationHints: {
            enabled: quickCreateDraft.illustrationHintsEnabled,
          },
          informationPolicy,
        },
      },
    });
    setIsQuickCreatingRoom(false);

    if (error) {
      setQuickCreateError(error);
      return;
    }

    onOperationStatusChange("已创建快捷酒馆。");
    setIsQuickCreateOpen(false);
  };

  const buildQuickCreateTextFieldAgentContext = () => {
    const promptStyleId = normalizeTavernPromptStyleId(quickCreateDraft.promptStyleId);
    const presentationProfileId = normalizeTavernPresentationProfileId(
      quickCreateDraft.presentationProfileId,
    );
    const systemNarrativePresetId = normalizeTavernSystemNarrativePresetId(
      quickCreateDraft.systemNarrativePresetId,
    );
    const platformStyleId = normalizeTavernRuleCompositionId(quickCreateDraft.platformStyleId);
    const ruleStack = resolveTavernPromptRuleStack({
      compositionId: platformStyleId,
    });
    const characterCount = clampQuickCreateInteger(quickCreateDraft.characterCount, 3, 1, 8);
    const randomEventProbability = clampQuickCreateProbability(
      quickCreateDraft.randomEventProbability,
    );
    return {
      creationMode: "quick_create",
      quickCreateDraft: {
        title: quickCreateDraft.title,
        premise: quickCreateDraft.premise,
        background: quickCreateDraft.background,
        worldInfo: quickCreateDraft.worldInfo,
        storyGoal: quickCreateDraft.storyGoal,
        userPersonaName: quickCreateDraft.userPersonaName,
        presentationProfileId,
        promptSeed: {
          promptStyleId,
          systemNarrativePresetId,
          ruleCompositionId: platformStyleId,
          systemNarrativePreset: TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS.find((preset) =>
            preset.id === systemNarrativePresetId
          ),
          ruleComposition: ruleStack.composition,
          platformStyle: ruleStack.platformStyle,
          ruleGroups: ruleStack.ruleGroups,
        },
        characterSeedsText: quickCreateDraft.characterSeeds,
        characterSeeds: parseQuickCreateCharacterSeeds(quickCreateDraft.characterSeeds),
        advanced: {
          characterCount,
          informationMode: quickCreateDraft.informationMode,
          statusTrackingEnabled: quickCreateDraft.statusTrackingEnabled,
          randomEventsEnabled: quickCreateDraft.randomEventsEnabled,
          randomEventProbability,
          illustrationHintsEnabled: quickCreateDraft.illustrationHintsEnabled,
        },
      },
      existingRooms: rooms.map((room) => ({
        title: room.title,
        presentationProfileId: normalizeTavernPresentationProfileId(room.presentation?.profileId),
        promptBlockCount: room.prompt.blocks.filter((block) =>
          block.enabled && block.text.trim()
        ).length,
        characterCount: room.localCharacters?.length ?? 0,
      })),
    };
  };

  const runQuickCreateTextFieldAgent = async ({
    mode,
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
  }: {
    mode: "polish" | "inspire";
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
  }) => {
    const activeKey = `quick:${fieldKey}:${mode}`;
    setActiveTextFieldAgentKey(activeKey);
    setQuickCreateError("");
    try {
      const text = await onRunTextFieldAgent({
        mode,
        fieldLabel,
        currentText,
        context: {
          ...buildQuickCreateTextFieldAgentContext(),
          targetField: {
            key: fieldKey,
            label: fieldLabel,
          },
        },
      });
      if (text.trim()) {
        applyText(text);
      }
    } catch (error) {
      setQuickCreateError(getUnknownErrorMessage(error));
    } finally {
      setActiveTextFieldAgentKey((current) => current === activeKey ? "" : current);
    }
  };

  const renderQuickCreateTextFieldAgentActions = ({
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
  }: {
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
  }) => {
    const isPolishing = activeTextFieldAgentKey === `quick:${fieldKey}:polish`;
    const isInspiring = activeTextFieldAgentKey === `quick:${fieldKey}:inspire`;
    const isBusy = isQuickCreatingRoom || Boolean(activeTextFieldAgentKey);
    const run = (mode: "polish" | "inspire") => (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void runQuickCreateTextFieldAgent({
        mode,
        fieldKey,
        fieldLabel,
        currentText,
        applyText,
      });
    };

    return (
      <span className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={isBusy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={run("polish")}
        >
          <Pencil className="size-3" />
          {isPolishing ? "处理中" : "润色"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={isBusy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={run("inspire")}
        >
          <Sparkles className="size-3" />
          {isInspiring ? "处理中" : "灵感"}
        </Button>
      </span>
    );
  };

  return (
    <>
      <Button type="button" onClick={open}>
        <Sparkles className="size-4" />
        快捷创建
      </Button>

      <Dialog
        open={isQuickCreateOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            open();
            return;
          }
          closeQuickCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <form className="flex max-h-[82vh] flex-col" onSubmit={submitQuickCreateRoom}>
            <DialogHeader>
              <DialogTitle>快捷创建酒馆</DialogTitle>
              <DialogDescription>
                输入最少设想后生成可编辑酒馆预设。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="mt-4 min-h-0 flex-1 pr-3">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="标题" htmlFor="tavern-quick-title">
                    <Input
                      id="tavern-quick-title"
                      value={quickCreateDraft.title}
                      className={editorControlClassName}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        title: event.target.value,
                      })}
                    />
                  </EditorField>
                  <EditorField label="酒馆风格" htmlFor="tavern-quick-prompt-style">
                    <NativeSelect
                      id="tavern-quick-prompt-style"
                      value={quickCreateDraft.promptStyleId}
                      className={editorControlClassName}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        promptStyleId: event.target.value,
                      })}
                    >
                      {TAVERN_PROMPT_STYLE_PRESETS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="呈现规则" htmlFor="tavern-quick-presentation-profile">
                    <NativeSelect
                      id="tavern-quick-presentation-profile"
                      value={quickCreateDraft.presentationProfileId}
                      className={editorControlClassName}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        presentationProfileId: event.target.value,
                      })}
                    >
                      {TAVERN_PRESENTATION_PROFILE_OPTIONS.map((profile) => (
                        <NativeSelectOption key={profile.id} value={profile.id}>
                          {profile.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="叙事风格" htmlFor="tavern-quick-system-narrative">
                    <NativeSelect
                      id="tavern-quick-system-narrative"
                      value={quickCreateDraft.systemNarrativePresetId}
                      className={editorControlClassName}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        systemNarrativePresetId: event.target.value,
                      })}
                    >
                      {TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="写作组合" htmlFor="tavern-quick-platform-style">
                    <NativeSelect
                      id="tavern-quick-platform-style"
                      value={quickCreateDraft.platformStyleId}
                      className={editorControlClassName}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        platformStyleId: event.target.value,
                      })}
                    >
                      {TAVERN_RULE_COMPOSITION_OPTIONS.map((composition) => (
                        <NativeSelectOption key={composition.id} value={composition.id}>
                          {composition.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                </div>

                <EditorField
                  label="核心设想"
                  htmlFor="tavern-quick-premise"
                  action={renderQuickCreateTextFieldAgentActions({
                    fieldKey: "premise",
                    fieldLabel: "快捷创建核心设想",
                    currentText: quickCreateDraft.premise,
                    applyText: (text) => setQuickCreateDraft((current) => ({
                      ...current,
                      premise: text,
                    })),
                  })}
                >
                  <Textarea
                    id="tavern-quick-premise"
                    value={quickCreateDraft.premise}
                    className={cn("min-h-[96px] resize-none text-sm leading-6", editorControlClassName)}
                    disabled={isQuickCreatingRoom}
                    onChange={(event) => setQuickCreateDraft({
                      ...quickCreateDraft,
                      premise: event.target.value,
                    })}
                  />
                </EditorField>

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField
                    label="背景故事"
                    htmlFor="tavern-quick-background"
                    action={renderQuickCreateTextFieldAgentActions({
                      fieldKey: "background",
                      fieldLabel: "快捷创建背景故事",
                      currentText: quickCreateDraft.background,
                      applyText: (text) => setQuickCreateDraft((current) => ({
                        ...current,
                        background: text,
                      })),
                    })}
                  >
                    <Textarea
                      id="tavern-quick-background"
                      value={quickCreateDraft.background}
                      className={cn("min-h-[88px] resize-none text-sm leading-6", editorControlClassName)}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        background: event.target.value,
                      })}
                    />
                  </EditorField>
                  <EditorField
                    label="世界书线索"
                    htmlFor="tavern-quick-world"
                    action={renderQuickCreateTextFieldAgentActions({
                      fieldKey: "worldInfo",
                      fieldLabel: "快捷创建世界书线索",
                      currentText: quickCreateDraft.worldInfo,
                      applyText: (text) => setQuickCreateDraft((current) => ({
                        ...current,
                        worldInfo: text,
                      })),
                    })}
                  >
                    <Textarea
                      id="tavern-quick-world"
                      value={quickCreateDraft.worldInfo}
                      className={cn("min-h-[88px] resize-none text-sm leading-6", editorControlClassName)}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        worldInfo: event.target.value,
                      })}
                    />
                  </EditorField>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                  <EditorField
                    label="角色线索"
                    htmlFor="tavern-quick-characters"
                    action={renderQuickCreateTextFieldAgentActions({
                      fieldKey: "characterSeeds",
                      fieldLabel: "快捷创建角色线索",
                      currentText: quickCreateDraft.characterSeeds,
                      applyText: (text) => setQuickCreateDraft((current) => ({
                        ...current,
                        characterSeeds: text,
                      })),
                    })}
                  >
                    <Textarea
                      id="tavern-quick-characters"
                      value={quickCreateDraft.characterSeeds}
                      className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                      disabled={isQuickCreatingRoom}
                      onChange={(event) => setQuickCreateDraft({
                        ...quickCreateDraft,
                        characterSeeds: event.target.value,
                      })}
                    />
                  </EditorField>
                  <div className="grid gap-3">
                    <EditorField label="用户称呼" htmlFor="tavern-quick-user">
                      <Input
                        id="tavern-quick-user"
                        value={quickCreateDraft.userPersonaName}
                        className={editorControlClassName}
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          userPersonaName: event.target.value,
                        })}
                      />
                    </EditorField>
                    <EditorField label="角色数量" htmlFor="tavern-quick-character-count">
                      <Input
                        id="tavern-quick-character-count"
                        type="number"
                        min={1}
                        max={8}
                        value={quickCreateDraft.characterCount}
                        className={editorControlClassName}
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          characterCount: event.target.value,
                        })}
                      />
                    </EditorField>
                  </div>
                </div>

                <EditorField
                  label="场景目标"
                  htmlFor="tavern-quick-goal"
                  action={renderQuickCreateTextFieldAgentActions({
                    fieldKey: "storyGoal",
                    fieldLabel: "快捷创建场景目标",
                    currentText: quickCreateDraft.storyGoal,
                    applyText: (text) => setQuickCreateDraft((current) => ({
                      ...current,
                      storyGoal: text,
                    })),
                  })}
                >
                  <Input
                    id="tavern-quick-goal"
                    value={quickCreateDraft.storyGoal}
                    className={editorControlClassName}
                    disabled={isQuickCreatingRoom}
                    onChange={(event) => setQuickCreateDraft({
                      ...quickCreateDraft,
                      storyGoal: event.target.value,
                    })}
                  />
                </EditorField>

                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm font-medium"
                  disabled={isQuickCreatingRoom}
                  onClick={() => setQuickCreateDraft({
                    ...quickCreateDraft,
                    advancedOpen: !quickCreateDraft.advancedOpen,
                  })}
                >
                  <span>高级内容</span>
                  {quickCreateDraft.advancedOpen
                    ? <ChevronDown className="size-4 text-muted-foreground" />
                    : <ChevronRight className="size-4 text-muted-foreground" />}
                </button>

                {quickCreateDraft.advancedOpen && (
                  <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                    <EditorField label="剧本模式" htmlFor="tavern-quick-information-mode">
                      <NativeSelect
                        id="tavern-quick-information-mode"
                        value={quickCreateDraft.informationMode}
                        className={editorControlClassName}
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          informationMode: event.target.value as QuickCreateRoomDraft["informationMode"],
                        })}
                      >
                        <NativeSelectOption value="open">开放演绎</NativeSelectOption>
                        <NativeSelectOption value="mystery">推理悬疑</NativeSelectOption>
                        <NativeSelectOption value="social_deduction">狼人杀阵营</NativeSelectOption>
                        <NativeSelectOption value="custom">自定义</NativeSelectOption>
                      </NativeSelect>
                    </EditorField>
                    <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={quickCreateDraft.statusTrackingEnabled}
                        className="accent-primary"
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          statusTrackingEnabled: event.target.checked,
                        })}
                      />
                      状态栏
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={quickCreateDraft.illustrationHintsEnabled}
                        className="accent-primary"
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          illustrationHintsEnabled: event.target.checked,
                        })}
                      />
                      插图提示
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={quickCreateDraft.randomEventsEnabled}
                        className="accent-primary"
                        disabled={isQuickCreatingRoom}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          randomEventsEnabled: event.target.checked,
                        })}
                      />
                      随机事件
                    </label>
                    <EditorField label="随机事件概率" htmlFor="tavern-quick-random-probability">
                      <Input
                        id="tavern-quick-random-probability"
                        type="number"
                        min={0}
                        max={100}
                        value={quickCreateDraft.randomEventProbability}
                        className={editorControlClassName}
                        disabled={isQuickCreatingRoom || !quickCreateDraft.randomEventsEnabled}
                        onChange={(event) => setQuickCreateDraft({
                          ...quickCreateDraft,
                          randomEventProbability: event.target.value,
                        })}
                      />
                    </EditorField>
                  </div>
                )}

                {quickCreateError && (
                  <div className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {quickCreateError}
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={isQuickCreatingRoom}
                onClick={closeQuickCreateDialog}
              >
                取消
              </Button>
              <Button type="submit" disabled={isQuickCreatingRoom}>
                <Sparkles className="size-4" />
                {isQuickCreatingRoom ? "生成中" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

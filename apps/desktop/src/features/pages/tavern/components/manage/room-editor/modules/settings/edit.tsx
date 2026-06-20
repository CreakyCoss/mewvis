import type { Ref } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  TavernProgressTrackerSettings,
  TavernRoleAssignmentDefinition,
  TavernRoom,
  TavernRoomSettings,
} from "../../../../../types";
import { EditorField } from "../../primitives";
import {
  applyInformationPolicyModePreset,
  cloneTavernRoomSettings,
  editorControlClassName,
  formatProgressJson,
  isRoleAssignmentDefinitionDraft,
  parseProgressJsonArray,
  settingsEditorMetricGridClassName,
  settingsFlagGridClassName,
} from "../../utils";
import type { ModuleSave } from "../types";

export type SettingsEditHandle = (data?: TavernRoom) => void;

type SettingsDraft = TavernRoomSettings & {
  progressTracker: TavernProgressTrackerSettings;
  rolePoolJson: string;
};

type SettingsEditProps = {
  bind: Ref<SettingsEditHandle>;
  data: TavernRoom;
  modelLabel: string;
  onSave: ModuleSave;
};

export const SettingsEdit = ({
  bind,
  data,
  onSave,
  modelLabel,
}: SettingsEditProps) => {
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [error, setError] = useState("");

  const open = (nextData = data) => {
    setError("");
    setDraft({
      ...cloneTavernRoomSettings(nextData.settings),
      progressTracker: { ...nextData.progressTracker },
      rolePoolJson: formatProgressJson(nextData.settings.informationPolicy.roleAssignment.rolePool),
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

    const rolePool = parseProgressJsonArray<TavernRoleAssignmentDefinition>(
      draft.rolePoolJson,
      "身份池",
      isRoleAssignmentDefinitionDraft,
    );
    if (!rolePool.ok) {
      setError(rolePool.error);
      return;
    }

    onSave({
      settings: {
        ...data.settings,
        immersiveDescriptionEnabled: draft.immersiveDescriptionEnabled,
        showExecutionTrace: draft.showExecutionTrace,
        autoAssetExtractionEnabled: draft.autoAssetExtractionEnabled,
        assetExtractionIntervalTurns: Math.min(
          10,
          Math.max(1, Number(draft.assetExtractionIntervalTurns) || 1),
        ),
        maxAssetDrafts: Math.min(20, Math.max(1, Number(draft.maxAssetDrafts) || 1)),
        directorMaxSpeakers: Math.min(
          6,
          Math.max(1, Number(draft.directorMaxSpeakers) || 1),
        ),
        agentKnowledgeCompactIntervalTurns: Math.min(
          50,
          Math.max(0, Number(draft.agentKnowledgeCompactIntervalTurns) || 0),
        ),
        statusTracking: {
          ...data.settings.statusTracking,
          ...draft.statusTracking,
        },
        randomEvents: {
          ...data.settings.randomEvents,
          enabled: draft.randomEvents.enabled,
          probability: Math.min(
            1,
            Math.max(0, Number(draft.randomEvents.probability) || 0),
          ),
        },
        illustrationHints: {
          ...data.settings.illustrationHints,
          enabled: draft.illustrationHints.enabled,
        },
        informationPolicy: {
          ...draft.informationPolicy,
          hiddenFacts: { ...draft.informationPolicy.hiddenFacts },
          roleAssignment: {
            ...draft.informationPolicy.roleAssignment,
            rolePool: rolePool.value.map((role) => ({ ...role })),
          },
        },
      },
      progressTracker: {
        enabled: draft.progressTracker.enabled,
        mode: draft.progressTracker.mode,
        intervalTurns: Math.min(
          50,
          Math.max(1, Number(draft.progressTracker.intervalTurns) || 1),
        ),
        applyMode: draft.progressTracker.applyMode,
        factConfidenceThreshold: Math.min(
          1,
          Math.max(0, Number(draft.progressTracker.factConfidenceThreshold) || 0),
        ),
        generateCheckpointBeforeContextTrim:
          draft.progressTracker.generateCheckpointBeforeContextTrim,
      },
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
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑运行设置</DialogTitle>
            <DialogDescription>
              调整执行过程、剧情资产整理和导演调度设置。
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4">
                <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
                  <div>
                    <div className="text-sm font-medium leading-5">酒馆模型</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      酒馆统一使用当前默认模型：{modelLabel}
                    </div>
                  </div>
                </div>

                <div className={settingsFlagGridClassName}>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.immersiveDescriptionEnabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        immersiveDescriptionEnabled: event.target.checked,
                      })}
                    />
                    沉浸描写
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.showExecutionTrace}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        showExecutionTrace: event.target.checked,
                      })}
                    />
                    显示执行过程
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.autoAssetExtractionEnabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        autoAssetExtractionEnabled: event.target.checked,
                      })}
                    />
                    自动整理剧情资产
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.statusTracking.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        statusTracking: {
                          ...draft.statusTracking,
                          enabled: event.target.checked,
                          visibleToUser: event.target.checked,
                        },
                      })}
                    />
                    显示状态栏
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.progressTracker.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          enabled: event.target.checked,
                        },
                      })}
                    />
                    自动追踪状态
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.randomEvents.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        randomEvents: {
                          ...draft.randomEvents,
                          enabled: event.target.checked,
                        },
                      })}
                    />
                    导演随机事件
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.illustrationHints.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        illustrationHints: {
                          ...draft.illustrationHints,
                          enabled: event.target.checked,
                        },
                      })}
                    />
                    插图提示
                  </label>
                </div>

                <div className="grid gap-3 rounded-md border border-border/70 bg-muted/15 p-3 sm:grid-cols-2">
                  <EditorField label="互动剧本模式" htmlFor="tavern-settings-information-mode">
                    <NativeSelect
                      id="tavern-settings-information-mode"
                      value={draft.informationPolicy.mode}
                      className={editorControlClassName}
                      onChange={(event) => {
                        const mode = event.target.value as TavernRoomSettings["informationPolicy"]["mode"];
                        setDraft({
                          ...draft,
                          informationPolicy: applyInformationPolicyModePreset(
                            mode,
                            draft.informationPolicy,
                          ),
                        });
                      }}
                    >
                      <NativeSelectOption value="open">开放演绎</NativeSelectOption>
                      <NativeSelectOption value="mystery">推理悬疑</NativeSelectOption>
                      <NativeSelectOption value="social_deduction">狼人杀阵营</NativeSelectOption>
                      <NativeSelectOption value="custom">自定义</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>

                  <EditorField label="界面视角" htmlFor="tavern-settings-information-view">
                    <NativeSelect
                      id="tavern-settings-information-view"
                      value={draft.informationPolicy.uiDefaultView}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          uiDefaultView: event.target.value as TavernRoomSettings["informationPolicy"]["uiDefaultView"],
                        },
                      })}
                    >
                      <NativeSelectOption value="public">公开视角</NativeSelectOption>
                      <NativeSelectOption value="reveal">复盘视角</NativeSelectOption>
                      <NativeSelectOption value="director">导演视角</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>

                  <EditorField label="心理揭示" htmlFor="tavern-settings-thought-reveal">
                    <NativeSelect
                      id="tavern-settings-thought-reveal"
                      value={draft.informationPolicy.revealThoughts}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          revealThoughts: event.target.value as TavernRoomSettings["informationPolicy"]["revealThoughts"],
                        },
                      })}
                    >
                      <NativeSelectOption value="manual">手动</NativeSelectOption>
                      <NativeSelectOption value="sceneOutcome">结局后</NativeSelectOption>
                      <NativeSelectOption value="never">不揭示</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>

                  <EditorField label="身份分配策略" htmlFor="tavern-settings-role-strategy">
                    <NativeSelect
                      id="tavern-settings-role-strategy"
                      value={draft.informationPolicy.roleAssignment.strategy}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            strategy: event.target.value as TavernRoomSettings["informationPolicy"]["roleAssignment"]["strategy"],
                          },
                        },
                      })}
                    >
                      <NativeSelectOption value="manual">手动</NativeSelectOption>
                      <NativeSelectOption value="director_random">导演随机</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>

                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.hideCharacterThoughts}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          hideCharacterThoughts: event.target.checked,
                        },
                      })}
                    />
                    隐藏角色心理
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.hiddenFacts.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          hiddenFacts: {
                            ...draft.informationPolicy.hiddenFacts,
                            enabled: event.target.checked,
                          },
                        },
                      })}
                    />
                    启用隐藏事实
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.roleAssignment.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            enabled: event.target.checked,
                            strategy: event.target.checked
                              ? draft.informationPolicy.roleAssignment.strategy
                              : "manual",
                          },
                        },
                      })}
                    />
                    剧本身份分配
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.roleAssignment.includeUser}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            includeUser: event.target.checked,
                          },
                        },
                      })}
                    />
                    用户参与身份池
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.roleAssignment.revealToAssignedCharacter}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            revealToAssignedCharacter: event.target.checked,
                          },
                        },
                      })}
                    />
                    本人可知身份
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.informationPolicy.roleAssignment.revealFactionMembers}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            revealFactionMembers: event.target.checked,
                          },
                        },
                      })}
                    />
                    同阵营互知
                  </label>

                  <div className="space-y-2 sm:col-span-2">
                    <div className="text-sm font-medium">身份池 JSON</div>
                    <Textarea
                      value={draft.rolePoolJson}
                      className={cn("min-h-32 font-mono text-xs", editorControlClassName)}
                      onChange={(event) => setDraft({
                        ...draft,
                        rolePoolJson: event.target.value,
                      })}
                    />
                  </div>
                </div>

                <div className={settingsEditorMetricGridClassName}>
                  <EditorField label="整理间隔" htmlFor="tavern-settings-asset-interval">
                    <Input
                      id="tavern-settings-asset-interval"
                      type="number"
                      min={1}
                      max={10}
                      value={draft.assetExtractionIntervalTurns}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        assetExtractionIntervalTurns: Math.min(
                          10,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      })}
                    />
                  </EditorField>
                  <EditorField label="草稿上限" htmlFor="tavern-settings-max-drafts">
                    <Input
                      id="tavern-settings-max-drafts"
                      type="number"
                      min={1}
                      max={20}
                      value={draft.maxAssetDrafts}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        maxAssetDrafts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                      })}
                    />
                  </EditorField>
                  <EditorField label="导演人数" htmlFor="tavern-settings-director-speakers">
                    <Input
                      id="tavern-settings-director-speakers"
                      type="number"
                      min={1}
                      max={6}
                      value={draft.directorMaxSpeakers}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        directorMaxSpeakers: Math.min(6, Math.max(1, Number(event.target.value) || 1)),
                      })}
                    />
                  </EditorField>
                  <EditorField label="角色压缩间隔" htmlFor="tavern-settings-agent-compact-interval">
                    <Input
                      id="tavern-settings-agent-compact-interval"
                      type="number"
                      min={0}
                      max={50}
                      value={draft.agentKnowledgeCompactIntervalTurns}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        agentKnowledgeCompactIntervalTurns: Math.min(
                          50,
                          Math.max(0, Number(event.target.value) || 0),
                        ),
                      })}
                    />
                  </EditorField>
                  <EditorField label="状态更新模式" htmlFor="tavern-settings-progress-mode">
                    <NativeSelect
                      id="tavern-settings-progress-mode"
                      value={draft.progressTracker.mode}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          mode: event.target.value as TavernProgressTrackerSettings["mode"],
                        },
                      })}
                    >
                      <NativeSelectOption value="manual">手动</NativeSelectOption>
                      <NativeSelectOption value="afterTurn">每轮</NativeSelectOption>
                      <NativeSelectOption value="fixedTurns">固定轮次</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="状态间隔" htmlFor="tavern-settings-progress-interval">
                    <Input
                      id="tavern-settings-progress-interval"
                      type="number"
                      min={1}
                      max={50}
                      value={draft.progressTracker.intervalTurns}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          intervalTurns: Math.min(
                            50,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        },
                      })}
                    />
                  </EditorField>
                  <EditorField label="事实置信度" htmlFor="tavern-settings-progress-confidence">
                    <Input
                      id="tavern-settings-progress-confidence"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.progressTracker.factConfidenceThreshold}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          factConfidenceThreshold: Math.min(
                            1,
                            Math.max(0, Number(event.target.value) || 0),
                          ),
                        },
                      })}
                    />
                  </EditorField>
                  <EditorField label="应用方式" htmlFor="tavern-settings-progress-apply-mode">
                    <NativeSelect
                      id="tavern-settings-progress-apply-mode"
                      value={draft.progressTracker.applyMode}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          applyMode: event.target.value as TavernProgressTrackerSettings["applyMode"],
                        },
                      })}
                    >
                      <NativeSelectOption value="review">需确认</NativeSelectOption>
                      <NativeSelectOption value="auto">自动</NativeSelectOption>
                    </NativeSelect>
                  </EditorField>
                  <EditorField label="随机事件概率" htmlFor="tavern-settings-random-event-probability">
                    <Input
                      id="tavern-settings-random-event-probability"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.randomEvents.probability}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        randomEvents: {
                          ...draft.randomEvents,
                          probability: Math.min(
                            1,
                            Math.max(0, Number(event.target.value) || 0),
                          ),
                        },
                      })}
                    />
                  </EditorField>
                </div>
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};

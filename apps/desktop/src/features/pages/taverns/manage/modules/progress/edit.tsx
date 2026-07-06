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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  TavernProgressView,
  TavernRoom,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusRule,
  TavernTaskDefinition,
} from "@/features/pages/taverns/manage/model";
import { EditorField } from "../../primitives";
import {
  editorControlClassName,
  formatProgressJson,
  isProgressViewDraft,
  isSceneOutcomeDraft,
  isStatusDefinitionDraft,
  isStatusRuleDraft,
  isTaskDefinitionDraft,
  parseProgressJsonArray,
  validateProgressConfigReferences,
} from "../../utils";
import type { ModuleSave } from "../types";

export type ProgressEditHandle = (data?: TavernRoom) => void;

type ProgressDraft = {
  statusDefinitionsJson: string;
  statusRulesJson: string;
  progressViewsJson: string;
  taskDefinitionsJson: string;
  sceneOutcomesJson: string;
};

type ProgressEditProps = {
  bind: Ref<ProgressEditHandle>;
  data: TavernRoom;
  onSave: ModuleSave;
};

export const ProgressEdit = ({ bind, data, onSave }: ProgressEditProps) => {
  const [draft, setDraft] = useState<ProgressDraft | null>(null);
  const [error, setError] = useState("");

  const open = (nextData = data) => {
    setError("");
    setDraft({
      statusDefinitionsJson: formatProgressJson(nextData.statusDefinitions),
      statusRulesJson: formatProgressJson(nextData.statusRules),
      progressViewsJson: formatProgressJson(nextData.progressViews),
      taskDefinitionsJson: formatProgressJson(nextData.taskDefinitions),
      sceneOutcomesJson: formatProgressJson(nextData.sceneOutcomes),
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

    const statusDefinitions = parseProgressJsonArray<TavernStatusDefinition>(
      draft.statusDefinitionsJson,
      "状态定义",
      isStatusDefinitionDraft,
    );
    if (!statusDefinitions.ok) {
      setError(statusDefinitions.error);
      return;
    }

    const statusRules = parseProgressJsonArray<TavernStatusRule>(draft.statusRulesJson, "状态规则", isStatusRuleDraft);
    if (!statusRules.ok) {
      setError(statusRules.error);
      return;
    }

    const progressViews = parseProgressJsonArray<TavernProgressView>(
      draft.progressViewsJson,
      "状态面板",
      isProgressViewDraft,
    );
    if (!progressViews.ok) {
      setError(progressViews.error);
      return;
    }

    const taskDefinitions = parseProgressJsonArray<TavernTaskDefinition>(
      draft.taskDefinitionsJson,
      "任务定义",
      isTaskDefinitionDraft,
    );
    if (!taskDefinitions.ok) {
      setError(taskDefinitions.error);
      return;
    }

    const sceneOutcomes = parseProgressJsonArray<TavernSceneOutcomeDefinition>(
      draft.sceneOutcomesJson,
      "结局条件",
      isSceneOutcomeDraft,
    );
    if (!sceneOutcomes.ok) {
      setError(sceneOutcomes.error);
      return;
    }

    const referenceError = validateProgressConfigReferences({
      statusDefinitions: statusDefinitions.value,
      statusRules: statusRules.value,
      progressViews: progressViews.value,
      taskDefinitions: taskDefinitions.value,
      sceneOutcomes: sceneOutcomes.value,
    });
    if (referenceError) {
      setError(referenceError);
      return;
    }

    onSave({
      statusDefinitions: statusDefinitions.value,
      statusRules: statusRules.value,
      progressViews: progressViews.value,
      taskDefinitions: taskDefinitions.value,
      sceneOutcomes: sceneOutcomes.value,
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
            <DialogTitle>编辑状态与进度配置</DialogTitle>
            <DialogDescription>编辑状态栏、规则引擎、任务目标和结局条件。任务与结局作用于当前场景。</DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
                <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  状态定义、状态规则和状态面板属于房间级配置；任务定义和结局条件属于当前场景。点击保存修改后会立即写入本地数据。
                </div>

                <EditorField
                  label="状态定义 JSON"
                  htmlFor="tavern-progress-status-definitions"
                  description="定义全局、场景、角色、关系等状态栏字段。"
                >
                  <Textarea
                    id="tavern-progress-status-definitions"
                    value={draft.statusDefinitionsJson}
                    spellCheck={false}
                    className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        statusDefinitionsJson: event.target.value,
                      })
                    }
                  />
                </EditorField>

                <EditorField
                  label="状态规则 JSON"
                  htmlFor="tavern-progress-status-rules"
                  description="把明确事实事件映射为状态数值变化。"
                >
                  <Textarea
                    id="tavern-progress-status-rules"
                    value={draft.statusRulesJson}
                    spellCheck={false}
                    className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        statusRulesJson: event.target.value,
                      })
                    }
                  />
                </EditorField>

                <EditorField
                  label="状态面板 JSON"
                  htmlFor="tavern-progress-views"
                  description="配置 globalHeader、sceneHeader、sidePanel、characterCard、composerBelow 等展示位置。"
                >
                  <Textarea
                    id="tavern-progress-views"
                    value={draft.progressViewsJson}
                    spellCheck={false}
                    className={cn("min-h-[200px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        progressViewsJson: event.target.value,
                      })
                    }
                  />
                </EditorField>

                <EditorField
                  label="任务定义 JSON"
                  htmlFor="tavern-progress-task-definitions"
                  description="配置个人、团队、可选支线等任务目标。"
                >
                  <Textarea
                    id="tavern-progress-task-definitions"
                    value={draft.taskDefinitionsJson}
                    spellCheck={false}
                    className={cn("min-h-[160px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        taskDefinitionsJson: event.target.value,
                      })
                    }
                  />
                </EditorField>

                <EditorField
                  label="结局条件 JSON"
                  htmlFor="tavern-progress-scene-outcomes"
                  description="配置胜负、阶段结束建议或自动结束条件。"
                >
                  <Textarea
                    id="tavern-progress-scene-outcomes"
                    value={draft.sceneOutcomesJson}
                    spellCheck={false}
                    className={cn("min-h-[160px] resize-y font-mono text-xs leading-5", editorControlClassName)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sceneOutcomesJson: event.target.value,
                      })
                    }
                  />
                </EditorField>
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

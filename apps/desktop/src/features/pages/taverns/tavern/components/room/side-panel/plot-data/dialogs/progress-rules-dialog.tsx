import { cn } from "@/lib/utils";
import { isTavernProgressVisibilityVisibleToUser } from "../../../../../core";
import { useTavernPageContext } from "@/features/pages/taverns/components/context";
import {
  formatStatusRuleValue,
  formatStatusTarget,
  formatStatusValue,
  ruleTargetLabels,
  statusEventStatusLabels,
  statusScopeLabels,
  updatePolicyModeLabels,
} from "../helpers";
import {
  EmptyDetailState,
  PlotDataSheet,
  type PlotDataDialogProps,
} from "./shared";

export const ProgressRulesDialog = ({ bind }: PlotDataDialogProps) => {
  const { activeRoom, roomCharacters } = useTavernPageContext();
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const statusDefinitionById = new Map(activeRoom?.statusDefinitions.map((definition) => [definition.id, definition]) ?? []);
  const visibleStatusDefinitions = activeRoom?.statusDefinitions.filter((definition) =>
    isTavernProgressVisibilityVisibleToUser(definition.visibility)
  ) ?? [];
  const visibleStatusRules = activeRoom?.statusRules.filter((rule) => {
    const definition = statusDefinitionById.get(rule.apply.statusId);
    return definition ? isTavernProgressVisibilityVisibleToUser(definition.visibility) : true;
  }) ?? [];
  const recentStatusEvents = activeRoom?.statusEvents
    .filter((event) => isTavernProgressVisibilityVisibleToUser(event.visibility))
    .slice(-12)
    .reverse() ?? [];

  return (
    <PlotDataSheet
      bind={bind}
      title="状态规则"
      description="查看状态定义、触发规则与最近变更。"
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">状态定义</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {visibleStatusDefinitions.length} 项
            </span>
          </div>
          {visibleStatusDefinitions.length > 0 ? (
            <div className="space-y-3">
              {visibleStatusDefinitions.map((definition) => (
                <div key={definition.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{definition.label}</span>
                    <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                      {statusScopeLabels[definition.scope]}
                    </span>
                    <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                      {definition.valueType}
                    </span>
                    <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                      {updatePolicyModeLabels[definition.updatePolicy.mode]}
                    </span>
                  </div>
                  {definition.description?.trim() && (
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/70">
                      {definition.description}
                    </div>
                  )}
                  <div className="mt-2 grid gap-1.5 text-xs text-current/70 sm:grid-cols-2">
                    <div>默认：{formatStatusValue(definition.defaultValue)}</div>
                    <div>
                      范围：{
                        typeof definition.min === "number" || typeof definition.max === "number"
                          ? `${definition.min ?? "-∞"} - ${definition.max ?? "+∞"}`
                          : "不限"
                      }
                    </div>
                    <div>
                      事件：{definition.updatePolicy.allowedEventTypes?.join("、") || "不限"}
                    </div>
                    <div>
                      置信度：{typeof definition.updatePolicy.confidenceThreshold === "number"
                        ? `${Math.round(definition.updatePolicy.confidenceThreshold * 100)}%`
                        : "默认"}
                    </div>
                    <div>
                      每轮上限：{definition.updatePolicy.maxDeltaPerTurn ?? "不限"}
                    </div>
                    <div>
                      审核阈值：{definition.updatePolicy.manualReviewAboveDelta ?? "未设置"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetailState>暂无可见状态定义。</EmptyDetailState>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">事件规则</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {visibleStatusRules.length} 条
            </span>
          </div>
          {visibleStatusRules.length > 0 ? (
            <div className="space-y-3">
              {visibleStatusRules.map((rule) => {
                const definition = statusDefinitionById.get(rule.apply.statusId);
                return (
                  <div key={rule.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{rule.label}</span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {rule.when.eventType}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {definition?.label ?? rule.apply.statusId}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1.5 text-xs text-current/70 sm:grid-cols-2">
                      <div>目标：{ruleTargetLabels[rule.apply.target ?? "eventTarget"]}</div>
                      <div>操作：{rule.apply.op === "add" ? "增减" : "设为"}</div>
                      <div className="sm:col-span-2">数值：{formatStatusRuleValue(rule)}</div>
                      <div>
                        限制：{rule.apply.clamp ? `${rule.apply.clamp[0]} - ${rule.apply.clamp[1]}` : "不限"}
                      </div>
                      <div>
                        每轮上限：{rule.safeguards?.maxDeltaPerTurn ?? "不限"}
                      </div>
                      <div>
                        审核阈值：{rule.safeguards?.manualReviewAboveDelta ?? "未设置"}
                      </div>
                      <div>
                        证据：{rule.safeguards?.requireExplicitEvidence ? "必须明确" : "默认"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetailState>暂无可见事件规则。</EmptyDetailState>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">最近变更</div>
            <span className="rounded-md bg-current/10 px-2 py-0.5 text-[11px] text-current/70">
              {recentStatusEvents.length} 条
            </span>
          </div>
          {recentStatusEvents.length > 0 ? (
            <div className="space-y-3">
              {recentStatusEvents.map((event) => {
                const definition = statusDefinitionById.get(event.statusId);
                const deltaText = typeof event.delta === "number" && event.delta !== 0
                  ? `${event.delta > 0 ? "+" : ""}${event.delta}`
                  : "";
                return (
                  <div key={event.id} className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {definition?.label ?? event.statusId}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {statusEventStatusLabels[event.status]}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {formatStatusTarget(event, characterNameById)}
                      </span>
                      <span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] text-current/70">
                        {Math.round(event.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-current/70">
                      {formatStatusValue(event.before)}{" -> "}{formatStatusValue(event.after)}
                      {deltaText && (
                        <span className={cn("ml-2", event.delta && event.delta > 0 ? "text-emerald-500" : "text-destructive")}>
                          {deltaText}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-current/70">
                      {event.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetailState>暂无状态变更。</EmptyDetailState>
          )}
        </section>
      </div>
    </PlotDataSheet>
  );
};

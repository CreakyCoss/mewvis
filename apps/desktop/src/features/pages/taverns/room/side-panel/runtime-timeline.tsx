import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  RefreshCw,
  Route,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createAgentClient } from "@/agent-client/runtime";
import type { AgentClientRuntimeSessionSnapshot, RuntimeSessionTimelineItem } from "@/agent-client/types";
import { cn } from "@/lib/utils";
import {
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
  tavernDirectorAgentRoleId,
} from "@/features/pages/taverns/tavern/core";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { EmptyPanelCard, PanelSectionTitle } from "./shared";

type TimelineFilter = "all" | "collaboration" | "agent" | "error";

const runtimeTimelineClient = createAgentClient();
const TIMELINE_LIMIT = 120;

const filterOptions: Array<{
  value: TimelineFilter;
  label: string;
  icon: typeof Activity;
}> = [
  { value: "all", label: "全部", icon: Activity },
  { value: "collaboration", label: "协作", icon: Workflow },
  { value: "agent", label: "Agent", icon: Bot },
  { value: "error", label: "异常", icon: AlertCircle },
];

const statusMeta = {
  started: {
    label: "开始",
    icon: Clock3,
    textClassName: "text-sky-600 dark:text-sky-300",
  },
  done: {
    label: "完成",
    icon: CheckCircle2,
    textClassName: "text-emerald-600 dark:text-emerald-300",
  },
  skipped: {
    label: "跳过",
    icon: Circle,
    textClassName: "text-muted-foreground",
  },
  error: {
    label: "异常",
    icon: AlertCircle,
    textClassName: "text-destructive",
  },
  idle: {
    label: "事件",
    icon: Circle,
    textClassName: "text-current/65",
  },
} as const;

const sourceLabels: Record<RuntimeSessionTimelineItem["source"], string> = {
  agent: "Agent",
  collaboration: "协作",
  runtime: "Runtime",
};

const eventTypeLabels: Record<string, string> = {
  workflow_started: "工作流开始",
  workflow_done: "工作流完成",
  step_started: "步骤开始",
  step_done: "步骤完成",
  step_skipped: "步骤跳过",
  agent_event: "Agent 事件",
  collaboration_result: "协作结果",
  text_delta: "文本输出",
  thinking_delta: "思考输出",
  thinking_end: "思考完成",
  tool_start: "工具开始",
  tool_end: "工具完成",
  done: "完成",
  error: "异常",
  event: "运行事件",
};

const compactId = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const formatTime = (timestamp?: string | null) =>
  timestamp
    ? new Date(timestamp).toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

const eventTypeLabel = (type: string) => eventTypeLabels[type] ?? type;

const itemStatus = (item: RuntimeSessionTimelineItem) => item.status ?? "idle";

const itemIcon = (item: RuntimeSessionTimelineItem) => {
  if (item.source === "agent") {
    return Bot;
  }
  if (item.type === "workflow_started" || item.type === "workflow_done") {
    return Workflow;
  }
  if (item.type === "step_skipped" || item.stepType === "router") {
    return Route;
  }
  return statusMeta[itemStatus(item)].icon;
};

const filterTimeline = (timeline: RuntimeSessionTimelineItem[], filter: TimelineFilter) => {
  if (filter === "all") {
    return timeline;
  }
  if (filter === "error") {
    return timeline.filter((item) => item.status === "error" || item.type === "error");
  }
  return timeline.filter((item) => item.source === filter);
};

const activeSceneInstanceIdFor = (room: ReturnType<typeof useTavernRoomContext>["activeRoom"]) =>
  room?.activeSceneInstanceId ?? room?.activeSceneId ?? room?.sceneInstances[0]?.id ?? room?.id ?? "";

const buildRoleLabelMap = (
  room: NonNullable<ReturnType<typeof useTavernRoomContext>["activeRoom"]>,
  characters: ReturnType<typeof useTavernRoomContext>["roomCharacters"],
) =>
  new Map<string, string>([
    [tavernDirectorAgentRoleId(room), "导演"],
    ...characters.map((character) => [tavernCharacterAgentRoleId(room, character), character.name] as const),
  ]);

const roleLabelFor = (item: RuntimeSessionTimelineItem, roleLabelById: Map<string, string>) => {
  const roleId = item.agentRoleId?.trim();
  if (!roleId) {
    return item.stepId || item.workflowId || item.type;
  }
  return roleLabelById.get(roleId) ?? compactId(roleId);
};

const timelineItemTitle = (item: RuntimeSessionTimelineItem, roleLabelById: Map<string, string>) => {
  if (item.type === "workflow_started" || item.type === "workflow_done") {
    return item.modeId ?? item.workflowId ?? eventTypeLabel(item.type);
  }
  if (item.type === "agent_event") {
    return `${roleLabelFor(item, roleLabelById)} · ${eventTypeLabel(item.detail || item.type)}`;
  }
  return `${roleLabelFor(item, roleLabelById)} · ${eventTypeLabel(item.type)}`;
};

const timelineItemSubtitle = (item: RuntimeSessionTimelineItem) =>
  [item.stepId, item.stepType, item.detail].filter(Boolean).join(" · ");

const RuntimeTimelineEvent = ({
  item,
  roleLabelById,
}: {
  item: RuntimeSessionTimelineItem;
  roleLabelById: Map<string, string>;
}) => {
  const status = itemStatus(item);
  const statusInfo = statusMeta[status];
  const Icon = itemIcon(item);
  const subtitle = timelineItemSubtitle(item);
  const metaItems = [
    formatTime(item.timestamp),
    sourceLabels[item.source],
    item.workflowRunId ? `run ${compactId(item.workflowRunId)}` : "",
    item.agentTaskId ? `task ${compactId(item.agentTaskId)}` : "",
  ].filter(Boolean);

  return (
    <details
      className="group overflow-hidden rounded-md border border-current/10 bg-current/[0.045] dark:bg-current/[0.065] text-current shadow-sm"
      open={status === "error"}
    >
      <summary className="flex cursor-pointer list-none items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-current/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-current/[0.08]">
          <Icon
            className={cn(
              "size-3",
              status === "started" && item.type !== "workflow_started" && "animate-pulse",
              statusInfo.textClassName,
            )}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
              {timelineItemTitle(item, roleLabelById)}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
                status === "error" ? "bg-destructive/10 text-destructive" : "bg-current/[0.08] text-current/65",
              )}
            >
              {statusInfo.label}
            </span>
          </span>
          {subtitle && <span className="mt-1 block truncate text-[11px] leading-4 text-current/65">{subtitle}</span>}
          {metaItems.length > 0 && (
            <span className="mt-1.5 flex min-w-0 flex-wrap gap-1">
              {metaItems.map((meta) => (
                <span
                  key={meta}
                  className="rounded-sm bg-current/[0.08] px-1.5 py-0.5 text-[10px] leading-4 text-current/60"
                >
                  {meta}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight className="mt-1 size-3.5 shrink-0 text-current/45 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-2 border-t border-current/10 px-2.5 py-2">
        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-current/65">
          {[
            ["workflow", item.workflowId],
            ["mode", item.modeId],
            ["step", item.stepId],
            ["role", item.agentRoleId],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-sm bg-current/[0.08] px-1.5 py-1" title={value ?? ""}>
              <span className="mr-1 opacity-65">{label}</span>
              <span className="font-medium">{compactId(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export const RuntimeTimelineSection = () => {
  const { activeRoom, roomCharacters, state, workspace, isSending } = useTavernRoomContext();
  const [snapshot, setSnapshot] = useState<AgentClientRuntimeSessionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const wasSendingRef = useRef(isSending);
  const sessionRootDir = useMemo(() => (activeRoom ? tavernBridgeSessionRootDir(activeRoom) : ""), [activeRoom]);
  const roleLabelById = useMemo(
    () => (activeRoom ? buildRoleLabelMap(activeRoom, roomCharacters) : new Map<string, string>()),
    [activeRoom, roomCharacters],
  );
  const localTraceCount = useMemo(() => {
    const sceneInstanceId = activeSceneInstanceIdFor(activeRoom);
    return sceneInstanceId ? (state.workflowTracesByInstance[sceneInstanceId]?.length ?? 0) : 0;
  }, [activeRoom, state.workflowTracesByInstance]);
  const timeline = snapshot?.timeline ?? [];
  const filteredTimeline = filterTimeline(timeline, filter);
  const latestWorkflowRunId = snapshot?.session.latestWorkflowRunId ?? "";
  const workflowCount = snapshot?.session.workflowRunIds.length ?? 0;
  const modeLabels = snapshot?.session.modeIds.length ? snapshot.session.modeIds : [];

  const refresh = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!activeRoom || !workspace.path || !sessionRootDir) {
        setSnapshot(null);
        setError("");
        return;
      }

      if (!options.silent) {
        setIsLoading(true);
      }
      try {
        const result = await runtimeTimelineClient.session.read({
          workspacePath: workspace.path,
          sessionRootDir,
          includeTimeline: true,
          timelineLimit: TIMELINE_LIMIT,
        });
        setSnapshot(result);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!options.silent) {
          setIsLoading(false);
        }
      }
    },
    [activeRoom, sessionRootDir, workspace.path],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSending) {
      return;
    }

    void refresh({ silent: true });
    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [isSending, refresh]);

  useEffect(() => {
    if (wasSendingRef.current && !isSending) {
      void refresh({ silent: true });
    }
    wasSendingRef.current = isSending;
  }, [isSending, refresh]);

  return (
    <section className="space-y-2 text-current">
      <PanelSectionTitle
        icon={Activity}
        actions={
          <>
            {isSending && (
              <span className="inline-flex h-6 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-7 rounded-md text-current/65 hover:bg-current/10 hover:text-current"
              title="刷新运行链路"
              aria-label="刷新运行链路"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </>
        }
      >
        运行链路
      </PanelSectionTitle>

      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-current/65">
        <div className="rounded-md bg-current/[0.055] px-1.5 py-1.5">
          <div className="font-semibold text-current">{timeline.length}</div>
          <div>事件</div>
        </div>
        <div className="rounded-md bg-current/[0.055] px-1.5 py-1.5">
          <div className="font-semibold text-current">{workflowCount}</div>
          <div>Workflow</div>
        </div>
        <div className="rounded-md bg-current/[0.055] px-1.5 py-1.5">
          <div className="font-semibold text-current">{localTraceCount}</div>
          <div>本地</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1">
        {filterOptions.map((option) => {
          const Icon = option.icon;
          const isActive = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "inline-flex h-7 min-w-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-current/10 bg-current/[0.045] text-current/65 hover:bg-current/10 hover:text-current",
              )}
              aria-pressed={isActive}
              onClick={() => setFilter(option.value)}
            >
              <Icon className="size-3" />
              {option.label}
            </button>
          );
        })}
      </div>

      {modeLabels.length > 0 || latestWorkflowRunId ? (
        <div className="space-y-1 rounded-md border border-current/10 bg-current/[0.045] px-2.5 py-2 text-[11px] leading-4 text-current/70">
          {modeLabels.length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-1">
              {modeLabels.map((mode) => (
                <span
                  key={mode}
                  className="max-w-full truncate rounded-sm bg-current/[0.08] px-1.5 py-0.5 font-medium text-current"
                  title={mode}
                >
                  {mode}
                </span>
              ))}
            </div>
          )}
          {latestWorkflowRunId && (
            <div className="truncate" title={latestWorkflowRunId}>
              latest · {compactId(latestWorkflowRunId)}
            </div>
          )}
        </div>
      ) : null}

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
          {error}
        </div>
      )}

      {isLoading && timeline.length === 0 ? (
        <EmptyPanelCard>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            正在读取运行链路
          </span>
        </EmptyPanelCard>
      ) : filteredTimeline.length === 0 ? (
        <EmptyPanelCard>{timeline.length === 0 ? "暂无运行链路" : "当前筛选没有事件"}</EmptyPanelCard>
      ) : (
        <div className="space-y-1.5">
          {filteredTimeline.map((item) => (
            <RuntimeTimelineEvent key={item.id} item={item} roleLabelById={roleLabelById} />
          ))}
        </div>
      )}
    </section>
  );
};

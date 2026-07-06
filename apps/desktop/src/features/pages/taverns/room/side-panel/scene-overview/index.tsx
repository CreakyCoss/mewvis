import { BookOpen, Clock3, FileText, MessagesSquare, Settings2, Sparkles, UsersRound } from "lucide-react";
import { useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import {
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "@/features/pages/taverns/tavern/runtime/scene-selectors";
import { cn } from "@/lib/utils";
import { compactText, EmptyPanelCard, PanelSectionTitle, TextBlock } from "../shared";

type SceneOverviewSectionProps = {
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
};

const replyModeDescriptions = {
  director: "由导演选择合适角色发言",
};

const SceneMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-current/10 bg-current/[0.045] px-3 py-2.5 shadow-sm">
    <div className="text-[11px] leading-4 opacity-60">{label}</div>
    <div className="mt-1 truncate text-[13px] font-semibold leading-5">{value}</div>
  </div>
);

export const SceneOverviewSection = ({ externalBusy, onBusyChange }: SceneOverviewSectionProps) => {
  const { activeRoom, roomCharacters, roomMessages, isSending, patchRoom } = useTavernRoomContext();

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  if (!activeRoom) {
    return null;
  }

  const activeScene = activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId);
  const sceneTitle =
    getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId, "") ||
    getTavernSceneDisplayTitle(activeRoom, activeScene?.id, "") ||
    activeRoom.sceneStatus?.location?.trim() ||
    activeRoom.title.trim() ||
    "当前场景";
  const scenePhase =
    activeRoom.sceneStatus?.scenePhase?.trim() ||
    activeRoom.sceneStatus?.atmosphere?.trim() ||
    activeRoom.sceneStatus?.timeLabel?.trim() ||
    "进行中";
  const completedMessages = roomMessages.filter(
    (message) => message.status !== "streaming" && message.status !== "error",
  );
  const openInteractions = activeRoom.pendingInteractions.filter((interaction) => interaction.status === "open");
  const sceneStatusLines = [
    activeRoom.sceneStatus?.location ? `地点：${activeRoom.sceneStatus.location}` : "",
    activeRoom.sceneStatus?.timeLabel ? `时间：${activeRoom.sceneStatus.timeLabel}` : "",
    activeRoom.sceneStatus?.weather ? `天气：${activeRoom.sceneStatus.weather}` : "",
    activeRoom.sceneStatus?.atmosphere ? `氛围：${activeRoom.sceneStatus.atmosphere}` : "",
    activeRoom.sceneStatus?.immediateThreat ? `当前压力：${activeRoom.sceneStatus.immediateThreat}` : "",
  ].filter(Boolean);

  return (
    <section className="space-y-4">
      <div className={cn("rounded-xl border p-3.5 shadow-sm", "border-current/10 bg-current/[0.04]")}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <BookOpen className="size-3.5" />
              当前节点
            </div>
            <h2 className="mt-1 truncate text-base font-semibold leading-6">{sceneTitle}</h2>
            <p className="mt-1 text-xs leading-5 opacity-70">{scenePhase}</p>
          </div>
          <div className="shrink-0 rounded-md border border-current/10 bg-background/50 px-2 py-1 text-[11px] opacity-75">
            {replyModeDescriptions[activeRoom.replyMode ?? "director"]}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <SceneMetric label="角色" value={`${roomCharacters.length} 位`} />
          <SceneMetric label="消息" value={`${completedMessages.length} 条`} />
          <SceneMetric label="资产整理" value={activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"} />
          <SceneMetric label="生成过程" value={activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"} />
        </div>
      </div>

      <div className="space-y-2.5">
        <PanelSectionTitle icon={Settings2}>运行体验</PanelSectionTitle>
        <div className="rounded-lg border border-current/10 bg-current/[0.045] px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-5">沉浸描写</div>
              <div className="text-[11px] leading-4 opacity-65">控制角色回复中的动作与心理描写呈现。</div>
            </div>
            <Switch
              checked={activeRoom.settings.immersiveDescriptionEnabled}
              disabled={isSending || externalBusy}
              onCheckedChange={(checked) =>
                patchRoom(activeRoom.id, {
                  settings: {
                    ...activeRoom.settings,
                    immersiveDescriptionEnabled: checked === true,
                  },
                })
              }
              aria-label="沉浸描写"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <PanelSectionTitle icon={Sparkles}>场景状态</PanelSectionTitle>
        {sceneStatusLines.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-current/10 bg-current/[0.045] px-3 py-2.5 text-xs leading-5 shadow-sm">
            {sceneStatusLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : (
          <EmptyPanelCard>暂无场景状态。</EmptyPanelCard>
        )}
      </div>

      <div className="space-y-2.5">
        <PanelSectionTitle icon={FileText}>场景内容</PanelSectionTitle>
        <TextBlock label="场景" value={activeRoom.scene} />
        <TextBlock label="当前目标" value={activeRoom.sceneGoal} />
        <TextBlock label="推进方向" value={activeRoom.sceneDirection} />
      </div>

      <div className="space-y-2.5">
        <PanelSectionTitle icon={MessagesSquare}>待回应互动</PanelSectionTitle>
        {openInteractions.length > 0 ? (
          <div className="space-y-2">
            {openInteractions.slice(-4).map((interaction) => (
              <div
                key={interaction.id}
                className="rounded-lg border border-current/10 bg-current/[0.045] px-3 py-2.5 text-xs leading-5 shadow-sm"
              >
                <div className="mb-1 flex items-center gap-1.5 font-semibold">
                  <Clock3 className="size-3.5 text-primary" />
                  {interaction.kind}
                </div>
                <div className="whitespace-pre-wrap break-words opacity-80">{compactText(interaction.text)}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanelCard>暂无待回应互动。</EmptyPanelCard>
        )}
      </div>

      <div className="space-y-2.5">
        <PanelSectionTitle icon={UsersRound}>当前角色</PanelSectionTitle>
        {roomCharacters.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {roomCharacters.map((character) => (
              <span
                key={character.id}
                className="rounded-md border border-current/10 bg-current/[0.045] px-2 py-1 text-[11px] leading-4 shadow-sm"
              >
                {character.name}
              </span>
            ))}
          </div>
        ) : (
          <EmptyPanelCard>当前节点还没有角色。</EmptyPanelCard>
        )}
      </div>
    </section>
  );
};

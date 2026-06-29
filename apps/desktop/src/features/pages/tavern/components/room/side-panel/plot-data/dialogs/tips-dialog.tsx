import { Switch } from "@/components/ui/switch";
import { useTavernPageContext } from "../../../../context";
import {
  buildTavernCurrentCharacterMemoriesText,
  buildTavernCurrentSceneMemoryText,
} from "../../memory-summary";
import { TextBlock } from "../../shared";
import {
  EmptyDetailState,
  PlotDataSheet,
  replyModeDescriptions,
  type PlotDataDialogProps,
} from "./shared";

export const TipsDialog = ({ bind }: PlotDataDialogProps) => {
  const { activeRoom, isSending, patchRoom, roomCharacters } = useTavernPageContext();
  const userPersonaName = activeRoom?.userPersonaName.trim() ?? "";
  const sceneStatusItems = activeRoom ? [
    `回复方式：${replyModeDescriptions[activeRoom.replyMode ?? "director"]}`,
    userPersonaName && userPersonaName !== "我" ? `你的称呼：${userPersonaName}` : "",
    `沉浸描写：${activeRoom.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}`,
    `生成过程：${activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"}`,
    `自动整理资产：${activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}`,
  ].filter(Boolean) : [];
  const currentSceneMemoryText = activeRoom
    ? buildTavernCurrentSceneMemoryText(activeRoom)
    : "";
  const currentCharacterMemoriesText = activeRoom
    ? buildTavernCurrentCharacterMemoriesText(activeRoom, roomCharacters)
    : "";

  return (
    <PlotDataSheet
      bind={bind}
      title="现场提示"
      description="查看酒馆现场的使用提醒。"
    >
      {activeRoom ? (
        <div className="space-y-4">
          <div className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">沉浸描写</div>
                <div className="mt-0.5 text-xs leading-5 text-current/70">
                  动作、神态、感官与环境互动
                </div>
              </div>
              <Switch
                size="sm"
                checked={activeRoom.settings.immersiveDescriptionEnabled}
                disabled={isSending}
                aria-label="切换沉浸描写"
                onCheckedChange={(checked) => patchRoom(activeRoom.id, {
                  settings: {
                    ...activeRoom.settings,
                    immersiveDescriptionEnabled: checked,
                  },
                })}
              />
            </div>
            <div className="mt-3 grid gap-1.5 text-xs text-current/70">
              {sceneStatusItems.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
          <TextBlock label="场景描述" value={activeRoom.scene} />
          <TextBlock label="场景目标" value={activeRoom.sceneGoal} />
          <TextBlock label="房间记忆" value={activeRoom.memory} />
          <TextBlock label="当前节点场景记忆" value={currentSceneMemoryText} />
          <TextBlock label="当前节点角色记忆" value={currentCharacterMemoriesText} />
          <div className="rounded-md border bg-current/[0.065] dark:bg-current/[0.09] px-4 py-3 text-sm leading-6 text-current/70">
            剧情结构和世界书是酒馆共享资产；入席角色、场景设定和场景记忆在对应故事场景中维护。
          </div>
        </div>
      ) : (
        <EmptyDetailState>暂无现场信息。</EmptyDetailState>
      )}
    </PlotDataSheet>
  );
};

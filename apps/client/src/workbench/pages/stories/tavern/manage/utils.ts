import { cloneDeep } from "lodash-es";
import type { TavernReplyMode, TavernRoomConfig } from "@/workbench/pages/stories/tavern/manage/model";

export const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [{ value: "director", label: "导演调度" }];

export const formatCount = (value: number, label: string) => `${value} ${label}`;

export const emptyValueText = "未设置";

export const editorControlClassName = "w-full bg-background/80 shadow-none";

export const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "导演调度";

export const cloneTavernRoom = (room: TavernRoomConfig): TavernRoomConfig => {
  return cloneDeep(room);
};

export const prepareTavernRoomForSave = (room: TavernRoomConfig): TavernRoomConfig => cloneTavernRoom(room);

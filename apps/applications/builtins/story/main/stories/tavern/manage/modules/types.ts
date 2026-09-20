import type { TavernRoomConfig } from "@/stories/tavern/manage/model";

export type ModuleSave = (patch: Partial<TavernRoomConfig>) => void;

export type ModuleEditProps = {
  data: TavernRoomConfig;
  onSave: ModuleSave;
};

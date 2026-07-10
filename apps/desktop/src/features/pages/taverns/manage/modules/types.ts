import type { TavernRoomConfig } from "@/features/pages/taverns/manage/model";

export type ModuleSave = (patch: Partial<TavernRoomConfig>) => void;

export type ModuleEditProps = {
  data: TavernRoomConfig;
  onSave: ModuleSave;
};

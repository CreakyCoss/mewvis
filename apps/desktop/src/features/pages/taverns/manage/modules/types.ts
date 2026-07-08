import type { TavernRoom } from "@/features/pages/taverns/manage/model";

export type ModuleSave = (patch: Partial<TavernRoom>) => void;

export type ModuleEditProps = {
  data: TavernRoom;
  onSave: ModuleSave;
};

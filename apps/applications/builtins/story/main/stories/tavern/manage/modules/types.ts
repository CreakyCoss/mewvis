import type { TavernRoomConfig } from "../model";
export type ModuleChange = (patch: Partial<TavernRoomConfig>) => void;
export type ModuleEditProps = {
  data: TavernRoomConfig;
  onChange: ModuleChange;
};

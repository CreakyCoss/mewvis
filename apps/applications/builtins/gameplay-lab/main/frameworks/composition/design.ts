import type { Issue } from "../../shared/contracts";
import type {
  GameComposition,
  ModuleDefinition,
  PresetSummary,
} from "./contracts";
export interface CompositionDesign<M> {
  skeletonName: string;
  layoutName: string;
  description: string;
  presetEffect: string;
  presets: readonly PresetSummary[];
  modules: readonly { definition: ModuleDefinition }[];
  resolve(
    model: M,
    draft?: boolean,
  ): { issues: Issue[]; snapshot: GameComposition };
  matchingPreset(model: M): string;
  applyPreset(model: M, id: string): void;
  setModuleEnabled(model: M, id: string, enabled: boolean): void;
}

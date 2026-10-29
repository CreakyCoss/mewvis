import type { SimulatorRef } from "../shared/contracts";
export type GameTypeId = "systems" | "card" | "narrative";
export type FrameworkId =
  "resource-development" | "card-scoring" | "branching-story" | "doudizhu";
export interface FrameworkDefinition {
  id: FrameworkId;
  gameType: GameTypeId;
  name: string;
  description: string;
  simulator: SimulatorRef;
  scope: string;
  schema:
    | "gameplay-model-v1"
    | "gameplay-card-v1"
    | "gameplay-narrative-v1"
    | "gameplay-doudizhu-v1";
}

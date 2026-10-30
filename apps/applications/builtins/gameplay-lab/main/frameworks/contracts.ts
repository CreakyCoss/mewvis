import type { SimulatorRef } from "../shared/contracts";
export type GameTypeId = "systems" | "card" | "narrative" | "board";
export type FrameworkId =
  | "resource-development"
  | "card-scoring"
  | "branching-story"
  | "doudizhu"
  | "board-economy";
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
    | "gameplay-doudizhu-v1"
    | "gameplay-board-economy-v1";
}

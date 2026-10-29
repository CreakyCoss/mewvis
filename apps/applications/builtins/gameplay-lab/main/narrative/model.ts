import type { SimulatorRef } from "../shared/contracts";
import { uid } from "../shared/utils";
export type StoryValue = boolean | number | string;
export interface StoryVariable {
  id: string;
  name: string;
  type: "boolean" | "number" | "text";
  initial: StoryValue;
}
export interface StoryCondition {
  variable: string;
  op: "eq" | "neq" | "gte" | "lte";
  value: StoryValue;
}
export interface StoryEffect {
  variable: string;
  operation: "set" | "add";
  value: StoryValue;
}
export interface StoryChoice {
  id: string;
  label: string;
  target: string;
  conditions: StoryCondition[];
  effects: StoryEffect[];
}
export interface StoryNode {
  id: string;
  title: string;
  text: string;
  speaker: string;
  ending: boolean;
  choices: StoryChoice[];
}
export interface NarrativeModel {
  format: "gameplay-narrative-v1";
  id: string;
  name: string;
  description: string;
  characters: { id: string; name: string; description: string }[];
  variables: StoryVariable[];
  nodes: StoryNode[];
  startNode: string;
}
export const narrativeSimulator: SimulatorRef = {
  id: "branching-narrative",
  version: 1,
};
export function blankNarrative(name: string): NarrativeModel {
  return {
    format: "gameplay-narrative-v1",
    id: uid("story"),
    name,
    description: "",
    characters: [],
    variables: [],
    nodes: [],
    startNode: "",
  };
}

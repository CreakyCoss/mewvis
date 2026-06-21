import type { Ref } from "react";
import type {
  TavernProgressView,
  TavernStatusDefinition,
  TavernStatusValue,
  TavernTaskDefinition,
  TavernTaskState,
} from "../../../types";

export type SidePanelHandle = {
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

export type SidePanelProps = {
  bind: Ref<SidePanelHandle>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export type DetailPanelKey =
  | "asset-drafts"
  | "timeline"
  | "lorebook"
  | "illustration-hints"
  | "progress-rules"
  | "tasks-outcomes"
  | "script-review"
  | "private-intel"
  | "tips";

export type StatusProgressItem = Extract<TavernProgressView["items"][number], { type: "status" }>;

export type ResolvedStatusMetric = {
  key: string;
  definition: TavernStatusDefinition;
  item: StatusProgressItem;
  value: TavernStatusValue;
  percent: number;
};

export type TaskValueDisplay = {
  mode: "progress" | "status";
  label: string;
  valueText: string;
  currentText: string;
  percent: number;
  targetText?: string;
  targetPercent?: number;
};

export type TaskCardData = {
  task: TavernTaskDefinition;
  state?: TavernTaskState;
  status: TavernTaskState["status"];
  metric?: TaskValueDisplay;
};

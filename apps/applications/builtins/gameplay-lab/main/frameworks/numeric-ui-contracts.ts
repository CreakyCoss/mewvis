import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { DesignBrief } from "../app/projects/model";
import type { Model } from "../domains/turn/model";
import type { ContentLocation } from "../shared/content";
import type { ReadinessIssue } from "../shared/contracts";
import type { Trial } from "../validation/records/records";
/** Only numerical workspaces use this adapter; unrelated games have their own workspace and state. */
export type NumericView =
  | "composition"
  | `module/${string}`
  | "cards"
  | "decks"
  | "scoring"
  | "content"
  | "overview"
  | "model"
  | "rules"
  | "strategy"
  | "runs"
  | "versions"
  | "settings";
export interface NumericSceneProps {
  trial: Trial;
  cursor: number;
  cards: string[];
  busy: boolean;
  readOnly: boolean;
  setCursor(cursor: number): void;
  setCards(ids: string[]): void;
  execute(action: string, automatic?: boolean): void;
  newGame(): void;
  newGameDisabled: boolean;
}
export interface NumericFrameworkUi {
  navigation(
    model: Model,
  ): readonly { id: NumericView; name: string; icon: LucideIcon }[];
  contentView(model: Model, location: ContentLocation): NumericView | null;
  issueView(issue: ReadinessIssue): NumericView;
  renderDesign(props: {
    model: Model;
    view: NumericView;
    issues: ReadinessIssue[];
    disabled: boolean;
    brief: DesignBrief;
    open(view: NumericView): void;
    play(): void;
    fix(issue: ReadinessIssue): void;
    changeBrief(brief: DesignBrief): void;
    update(change: (model: Model) => void): void;
  }): ReactNode;
  renderScene(props: NumericSceneProps): ReactNode;
}

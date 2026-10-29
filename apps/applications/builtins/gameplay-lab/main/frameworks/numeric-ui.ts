import type { Project } from "../app/projects/model";
import { cardScoringUi } from "./card-scoring/workspace-ui";
import type { NumericFrameworkUi } from "./numeric-ui-contracts";
export function numericFrameworkUi(
  project: Project,
): NumericFrameworkUi | null {
  return project.direction === "card-scoring" &&
    project.model.format === "gameplay-card-v1"
    ? cardScoringUi
    : null;
}

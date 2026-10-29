import { blankNarrative } from "./branching-story/model";
import { createCardScoringModel } from "./card-scoring/structure";
import type { FrameworkId } from "./contracts";
import { createDoudizhuModel } from "./doudizhu/model";
import { blankModel } from "./numeric-runtime";

export function createFrameworkModel(
  id: FrameworkId,
  name: string,
  presetId?: string,
) {
  switch (id) {
    case "doudizhu":
      return createDoudizhuModel(name, presetId);
    case "card-scoring":
      return createCardScoringModel(name);
    case "resource-development":
      return blankModel(name);
    case "branching-story":
      return blankNarrative(name);
  }
}

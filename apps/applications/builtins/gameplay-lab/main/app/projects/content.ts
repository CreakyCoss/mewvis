import { cardContent } from "../../domains/card/content";
import { turnContent } from "../../domains/turn/content";
import { narrativeContent } from "../../frameworks/branching-story/content";
import {
  contentKindNames,
  type ContentIndex,
  type ContentItem,
  type ContentKind,
  type ContentLocation,
} from "../../shared/content";
import type { Issue } from "../../shared/contracts";
import type { DesignModel } from "./model";

export function projectContent(model: DesignModel): ContentIndex {
  switch (model.format) {
    case "gameplay-doudizhu-v1":
      return { items: [], references: [] };
    case "gameplay-card-v1":
      return cardContent(model);
    case "gameplay-narrative-v1":
      return narrativeContent(model);
    case "gameplay-model-v1":
      return turnContent(model);
  }
}
export function searchContent(
  index: ContentIndex,
  query: string,
  kind: ContentKind | "all" = "all",
): ContentItem[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return index.items.filter((item) => {
    const text =
      `${item.name} ${item.description} ${item.id} ${contentKindNames[item.kind]}`.toLocaleLowerCase();
    return (
      (kind === "all" || item.kind === kind) &&
      words.every((word) => text.includes(word))
    );
  });
}
export function contentIssueLocation(
  index: ContentIndex,
  issue: Issue,
  model: DesignModel,
): ContentLocation {
  if (["模型", "策划"].includes(issue.path))
    return { area: "settings", id: "", key: "" };
  const item = index.items.find(
    (item) =>
      item.kind !== "flow" && item.kind !== "choice" && item.id === issue.path,
  );
  if (item) return item.location;
  if (model.format === "gameplay-narrative-v1")
    return {
      area:
        issue.path === "variables"
          ? "variables"
          : issue.path === "characters"
            ? "characters"
            : "nodes",
      id: "",
      key: issue.path === "起始剧情" ? "flow:flow" : "",
    };
  if (["流程", "周期结算"].includes(issue.path))
    return { area: "rules", id: "", key: "flow:flow" };
  if (
    model.format === "gameplay-card-v1" &&
    ["牌库", "卡牌", "卡牌与牌库", "卡牌模型"].includes(issue.path)
  )
    return { area: "rules", id: "", key: "" };
  return { area: "model", id: "", key: "" };
}

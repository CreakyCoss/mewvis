import {
  Boxes,
  FileText,
  History,
  Layers3,
  LayoutGrid,
  Settings2,
} from "lucide-react";
import type { NumericFrameworkUi } from "../numeric-ui-contracts";
import { CardScoringEditor } from "./editor/CardScoringEditor";
import { CardScoringOverview } from "./editor/CardScoringOverview";
import { CardTable } from "./play/CardTable";
import { scoringRules } from "./structure";
export const cardScoringUi: NumericFrameworkUi = {
  navigation: [
    { id: "overview", name: "玩法概览", icon: LayoutGrid },
    { id: "cards", name: "卡牌", icon: Layers3 },
    { id: "decks", name: "牌库", icon: Boxes },
    { id: "scoring", name: "计分与回合", icon: Settings2 },
    { id: "strategy", name: "验证设置", icon: FileText },
    { id: "runs", name: "试玩与实验", icon: History },
    { id: "versions", name: "版本", icon: Layers3 },
    { id: "settings", name: "项目设置", icon: Settings2 },
    { id: "content", name: "内容目录", icon: FileText },
    { id: "model", name: "高级规则", icon: Boxes },
  ],
  issueView: (issue) =>
    ["流程", "周期结算"].includes(issue.path)
      ? "scoring"
      : issue.path === "牌库"
        ? "decks"
        : "cards",
  contentView(model, location) {
    if (model.format !== "gameplay-card-v1") return null;
    const key = location.key;
    return key.startsWith("card:")
      ? "cards"
      : key.startsWith("deck:")
        ? "decks"
        : key === "flow:flow" ||
            key.startsWith("goal:") ||
            scoringRules(model).some(
              (rule) => key === "action:" + rule.action.id,
            )
          ? "scoring"
          : location.area === "rules"
            ? "cards"
            : null;
  },
  renderDesign({ model, view, update, ...props }) {
    if (model.format !== "gameplay-card-v1") return null;
    const change: import("react").ComponentProps<
      typeof CardScoringEditor
    >["update"] = (fn) =>
      update((model) => {
        if (model.format === "gameplay-card-v1") fn(model);
      });
    if (view === "overview")
      return <CardScoringOverview model={model} update={change} {...props} />;
    if (view === "cards" || view === "decks" || view === "scoring")
      return <CardScoringEditor model={model} tab={view} update={change} />;
    return null;
  },
  renderScene: (props) => <CardTable {...props} />,
};

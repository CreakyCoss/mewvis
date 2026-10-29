import {
  contentItem,
  contentKey,
  type ContentIndex,
} from "../../shared/content";
import type { NarrativeModel } from "./model";

export function narrativeContent(model: NarrativeModel): ContentIndex {
  const index: ContentIndex = { items: [], references: [] };
  for (const character of model.characters)
    index.items.push(
      contentItem(
        "character",
        character.id,
        character.name,
        character.description,
        "characters",
      ),
    );
  for (const variable of model.variables)
    index.items.push(
      contentItem(
        "variable",
        variable.id,
        variable.name,
        `${{ boolean: "标记", number: "整数", text: "文本" }[variable.type]} · 初始值 ${typeof variable.initial === "boolean" ? (variable.initial ? "是" : "否") : String(variable.initial)}`,
        "variables",
      ),
    );
  index.items.push(
    contentItem("flow", "flow", "起始剧情", "从这里设置叙事的入口。", "nodes"),
  );
  if (model.startNode)
    index.references.push({
      from: contentKey("flow", "flow"),
      to: contentKey("node", model.startNode),
      label: "叙事入口",
    });
  for (const node of model.nodes) {
    const from = contentKey("node", node.id);
    index.items.push(
      contentItem(
        "node",
        node.id,
        node.title,
        `${node.ending ? "结局" : "剧情"} · ${node.text}`,
        "nodes",
      ),
    );
    if (node.speaker)
      index.references.push({
        from,
        to: contentKey("character", node.speaker),
        label: "发言人物",
      });
    for (const choice of node.choices) {
      const key = contentKey("choice", choice.id);
      index.items.push(
        contentItem(
          "choice",
          choice.id,
          choice.label,
          `所属剧情：${node.title || "未命名剧情"}`,
          "nodes",
          node.id,
        ),
      );
      index.references.push({ from, to: key, label: "剧情选项" });
      if (choice.target)
        index.references.push({
          from: key,
          to: contentKey("node", choice.target),
          label: "跳转目标",
        });
      choice.conditions.forEach((condition, i) =>
        index.references.push({
          from: key,
          to: contentKey("variable", condition.variable),
          label: `条件 ${i + 1}`,
        }),
      );
      choice.effects.forEach((effect, i) =>
        index.references.push({
          from: key,
          to: contentKey("variable", effect.variable),
          label: `后果 ${i + 1}`,
        }),
      );
    }
  }
  return index;
}

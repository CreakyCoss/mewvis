/** A read-only authoring index; each game domain supplies its own content and links. */
export type ContentArea =
  | "model"
  | "rules"
  | "characters"
  | "variables"
  | "nodes"
  | "strategy"
  | "overview"
  | "settings";
export type ContentKind =
  | "state"
  | "capability"
  | "action"
  | "goal"
  | "card"
  | "deck"
  | "character"
  | "variable"
  | "node"
  | "choice"
  | "flow";
export const contentKindNames: Record<ContentKind, string> = {
  state: "状态",
  capability: "能力",
  action: "行动",
  goal: "目标",
  card: "卡牌",
  deck: "牌库",
  character: "人物",
  variable: "变量",
  node: "剧情",
  choice: "选项",
  flow: "流程",
};
export interface ContentLocation {
  area: ContentArea;
  id: string;
  key: string;
}
export interface ContentItem {
  key: string;
  id: string;
  kind: ContentKind;
  name: string;
  description: string;
  location: ContentLocation;
}
export interface ContentReference {
  from: string;
  to: string;
  label: string;
}
export interface ContentIndex {
  items: ContentItem[];
  references: ContentReference[];
}
export const contentKey = (kind: ContentKind, id: string) => `${kind}:${id}`;
export function contentItem(
  kind: ContentKind,
  id: string,
  name: string,
  description: string,
  area: ContentArea,
  ownerId = id,
): ContentItem {
  const key = contentKey(kind, id);
  return {
    key,
    id,
    kind,
    name: name.trim() || `未命名${contentKindNames[kind]}`,
    description,
    location: { area, id: ownerId, key },
  };
}

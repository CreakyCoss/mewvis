export type TavernPromptLayer = "system" | "tavern" | "character" | "turn" | "context";

export type TavernPromptAttributeValue = string | number | boolean | null | undefined;

export type TavernPromptSection = {
  id: string;
  layer: TavernPromptLayer;
  content: string | string[];
  tag?: string;
  attributes?: Record<string, TavernPromptAttributeValue>;
  includeWhenEmpty?: boolean;
  emptyContent?: string;
};

const TAVERN_PROMPT_LAYER_PRIORITY: Record<TavernPromptLayer, number> = {
  system: 0,
  tavern: 10,
  character: 20,
  turn: 30,
  context: 40,
};

export const joinPromptLines = (lines: Array<string | null | undefined | false>) =>
  lines.filter((line): line is string => typeof line === "string" && line.length > 0).join("\n");

const escapePromptAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderAttributes = (attributes: Record<string, TavernPromptAttributeValue> | undefined) => {
  if (!attributes) {
    return "";
  }

  const rendered = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${escapePromptAttribute(String(value))}"`);

  return rendered.length > 0 ? ` ${rendered.join(" ")}` : "";
};

const normalizeSectionContent = (section: TavernPromptSection) => {
  const content = Array.isArray(section.content) ? joinPromptLines(section.content) : section.content;
  const trimmed = content.trim();

  if (trimmed) {
    return trimmed;
  }

  return section.includeWhenEmpty ? (section.emptyContent ?? "（无）") : "";
};

export const renderTavernPromptSection = (section: TavernPromptSection) => {
  const content = normalizeSectionContent(section);
  if (!content) {
    return "";
  }

  if (!section.tag) {
    return content;
  }

  const attributes = renderAttributes(section.attributes);
  return `<${section.tag}${attributes}>\n${content}\n</${section.tag}>`;
};

export const renderTavernPromptSections = (
  sections: TavernPromptSection[],
  {
    sortByLayer = false,
  }: {
    sortByLayer?: boolean;
  } = {},
) => {
  const orderedSections = sortByLayer
    ? [...sections].sort(
        (left, right) => TAVERN_PROMPT_LAYER_PRIORITY[left.layer] - TAVERN_PROMPT_LAYER_PRIORITY[right.layer],
      )
    : sections;

  return orderedSections.map(renderTavernPromptSection).filter(Boolean).join("\n\n");
};

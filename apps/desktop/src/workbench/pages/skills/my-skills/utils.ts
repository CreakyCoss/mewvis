import type { Skill, SkillGroup } from "../types";

export const existingGroupSkillNames = (group: SkillGroup, skillsByKey: Map<string, Skill>) =>
  group.skills.map((skill) => skill.key).filter((key) => skillsByKey.has(key));

export const nextCustomGroupOrder = (groups: SkillGroup[]) => {
  const maxOrder = groups
    .filter((group) => group.source === "custom")
    .reduce((current, group) => Math.max(current, group.order), 999);
  return maxOrder + 1;
};

const sourceLabel = (source: string | undefined, readonly: boolean) => {
  if (!readonly) {
    return "自定义";
  }
  if (!source) {
    return "视图";
  }
  if (source === "app") {
    return "在线导入";
  }
  if (source === "upload") {
    return "本地上传";
  }
  return "系统内置";
};

const SOURCE_GROUP_ORDER = ["system", "app", "upload"];

export const groupSkillsBySource = (skills: Skill[]) => {
  const groupedSkills = new Map<string, Skill[]>();
  for (const skill of skills) {
    const source = skill.source || "system";
    const group = groupedSkills.get(source) ?? [];
    group.push(skill);
    groupedSkills.set(source, group);
  }

  return [...groupedSkills.entries()]
    .sort(([sourceA], [sourceB]) => {
      const indexA = SOURCE_GROUP_ORDER.indexOf(sourceA);
      const indexB = SOURCE_GROUP_ORDER.indexOf(sourceB);
      if (indexA === -1 && indexB === -1) {
        return sourceA.localeCompare(sourceB);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    })
    .map(([source, group]) => ({
      source,
      label: sourceLabel(source, true),
      skills: group,
    }));
};

export const filterSkills = (skills: Skill[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return skills;
  }
  return skills.filter((skill) => {
    const haystack = [skill.name, skill.description, skill.content, skill.source].join("\n").toLowerCase();
    return haystack.includes(normalized);
  });
};

const extractFrontmatter = (content: string) => {
  const normalized = content.trimStart();
  if (!normalized.startsWith("---")) {
    return null;
  }

  const endMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!endMatch) {
    return null;
  }

  return endMatch[1];
};

const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const extractFrontmatterDescription = (value: string) => {
  const frontmatter = extractFrontmatter(value);
  if (!frontmatter) {
    return null;
  }

  const lines = frontmatter.split(/\r?\n/);
  const descriptionLineIndex = lines.findIndex((line) => /^description\s*:/i.test(line.trimStart()));
  if (descriptionLineIndex === -1) {
    return null;
  }

  const descriptionLine = lines[descriptionLineIndex].trimStart();
  const inlineValue = descriptionLine.replace(/^description\s*:\s*/i, "");
  if (inlineValue && inlineValue !== ">" && inlineValue !== "|") {
    return stripWrappingQuotes(inlineValue);
  }

  const blockLines: string[] = [];
  for (const line of lines.slice(descriptionLineIndex + 1)) {
    if (/^\S[\w-]*\s*:/.test(line)) {
      break;
    }
    blockLines.push(line.trim());
  }

  const description = blockLines
    .filter((line) => line.length > 0)
    .join(inlineValue === "|" ? "\n" : " ")
    .trim();

  return description || null;
};

export const skillDescriptionPreview = (description?: string | null) => {
  const value = description?.trim();
  if (!value) {
    return "暂无描述";
  }

  const frontmatterDescription = extractFrontmatterDescription(value);
  const normalized = (frontmatterDescription ?? value).replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "暂无描述";
  }

  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
};

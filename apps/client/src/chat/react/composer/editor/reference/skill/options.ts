import type { ChatResources } from "@mewvis/chat-contracts";
import type { ChatInputSkillOption } from "@/chat/react/types";

export type Command = NonNullable<ChatResources["commands"]>[number];
type SkillGroup = NonNullable<ChatResources["skillGroups"]>[number];
type CommandEntry = {
  kind: "command";
  key: string;
  name: string;
  description: string;
  commandId: string;
  source: string;
  pluginName: string;
};
type SkillEntry = {
  kind: "skill";
  key: string;
  name: string;
  label: string;
  description: string;
  skillKey: string;
  group: string;
};
type AgentEntry = {
  kind: "agent";
  key: string;
  name: string;
  description: string;
  agentId: string;
  category: string;
  group: string;
};
export type ReferenceEntry = CommandEntry | SkillEntry | AgentEntry;

const nameCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

const commandSource = (id: string) => {
  const separator = id.lastIndexOf("/");
  return separator > 0 ? id.slice(0, separator) : "其他命令";
};

const commandEntries = (commands: Command[]): CommandEntry[] =>
  commands
    .map((command) => ({
      kind: "command" as const,
      key: `command:${command.id}`,
      name: command.label || command.id.split("/").pop() || command.description,
      description: command.description,
      commandId: command.id,
      source: commandSource(command.id),
      pluginName: command.pluginName?.trim() || "未命名插件",
    }))
    .sort(
      (left, right) =>
        nameCollator.compare(left.pluginName, right.pluginName) ||
        nameCollator.compare(left.source, right.source) ||
        nameCollator.compare(left.name, right.name),
    );

const skillEntries = (skills: ChatInputSkillOption[], groups: SkillGroup[]): SkillEntry[] => {
  const selected = new Map(skills.map((skill) => [skill.key, skill] as const));
  const assigned = new Set<string>();
  const entries: SkillEntry[] = [];
  for (const group of groups) {
    for (const item of group.skills) {
      const skill = selected.get(item.key);
      if (!skill || assigned.has(item.key)) continue;
      assigned.add(item.key);
      entries.push({
        kind: "skill",
        key: `skill:${group.value}:${skill.key}`,
        name: skill.name,
        label: skill.label || skill.name,
        description: skill.description,
        skillKey: skill.key,
        group: group.label,
      });
    }
  }
  for (const skill of skills) {
    if (assigned.has(skill.key)) continue;
    entries.push({
      kind: "skill",
      key: `skill:other:${skill.key}`,
      name: skill.name,
      label: skill.label || skill.name,
      description: skill.description,
      skillKey: skill.key,
      group: "其他技能",
    });
  }
  return entries;
};

const matches = (entry: ReferenceEntry, query: string) => {
  const searchable =
    entry.kind === "agent"
      ? `${entry.name}\n${entry.description}\n${entry.category}\n${entry.group}`
      : entry.kind === "command"
        ? `${entry.name}\n${entry.description}\n${entry.commandId}\n${entry.source}\n${entry.pluginName}`
        : `${entry.label}\n${entry.name}\n${entry.description}\n${entry.skillKey}\n${entry.group}`;
  return searchable.toLocaleLowerCase().includes(query);
};

export const getReferenceEntries = (
  skills: ChatInputSkillOption[],
  skillGroups: SkillGroup[],
  commands: Command[],
  includeCommands: boolean,
  query: string,
  agents: NonNullable<ChatResources["agents"]> = [],
): ReferenceEntry[] => {
  const available: ReferenceEntry[] = [
    ...(includeCommands ? commandEntries(commands) : []),
    ...agents.map((agent): AgentEntry => ({
      kind: "agent",
      key: `agent:${agent.value}`,
      agentId: agent.value,
      name: agent.label,
      description: agent.description ?? "",
      category: agent.category ?? "",
      group: "智能体",
    })),
    ...skillEntries(skills, skillGroups),
  ];
  const term = query.trim().toLocaleLowerCase();
  return term ? available.filter((entry) => matches(entry, term)) : available;
};

export const referenceGroupLabel = (entry: ReferenceEntry) =>
  entry.kind === "command"
    ? `插件 · ${entry.pluginName}`
    : entry.kind === "agent"
      ? entry.group
      : `技能 · ${entry.group}`;

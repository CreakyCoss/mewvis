import type { RuntimeModelInput } from "@/agent-client/protocol";
import type {
  TavernCharacter,
  TavernFactEvent,
  TavernRoleAssignmentDefinition,
  TavernRoom,
} from "../types";
import {
  createTavernRoleAssignmentFactEvents,
  type TavernRoleAssignmentParticipant,
  type TavernRoleAssignmentSelection,
  tavernBridgeSessionRootDir,
  tavernDirectorAgentRoleId,
} from "../core";
import { buildTavernBridgeSystemPrompt } from "./bridge-session";
import { runTavernRuntimeAgent } from "./agent";

export type TavernDirectorRoleAssignment = {
  factEvents: TavernFactEvent[];
  openingNarrator?: string;
  dayAnnouncement?: string;
  publicFact?: string;
  rawText: string;
};

type ParsedRoleAssignment = {
  assignments?: unknown;
  openingNarrator?: unknown;
  dayAnnouncement?: unknown;
  publicFact?: unknown;
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fencedMatch?.[1]?.trim().startsWith("{")) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
};

const expandRolePool = (rolePool: TavernRoleAssignmentDefinition[]) =>
  rolePool.flatMap((role) =>
    Array.from({ length: Math.max(1, Math.round(role.count || 1)) }, () => role)
  );

const createParticipants = (
  room: TavernRoom,
  characters: TavernCharacter[],
): TavernRoleAssignmentParticipant[] => [
  ...(room.settings.informationPolicy.roleAssignment.includeUser
    ? [{
        entity: { type: "user", userId: "user" } as const,
        label: room.userPersonaName.trim() || "你",
        isUser: true,
      }]
    : []),
  ...characters.map((character) => ({
    entity: { type: "character", characterId: character.id } as const,
    label: character.name,
    characterId: character.id,
    isUser: false,
  })),
];

const participantKey = (participant: TavernRoleAssignmentParticipant) =>
  participant.isUser ? "user:user" : `character:${participant.characterId ?? ""}`;

export const parseTavernDirectorRoleAssignmentText = ({
  text,
  room,
  characters,
  turnId,
  createdAt,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  turnId: string;
  createdAt: number;
}): TavernDirectorRoleAssignment => {
  const roleAssignment = room.settings.informationPolicy.roleAssignment;
  const participants = createParticipants(room, characters);
  const rolePool = expandRolePool(roleAssignment.rolePool);
  if (participants.length === 0 || rolePool.length !== participants.length) {
    throw new Error(`身份池数量必须等于参与者数量：participants=${participants.length}, roles=${rolePool.length}`);
  }

  let parsed: ParsedRoleAssignment;
  try {
    parsed = JSON.parse(extractJsonObject(text)) as ParsedRoleAssignment;
  } catch {
    throw new Error("导演身份分配输出不是合法 JSON。");
  }

  if (!Array.isArray(parsed.assignments)) {
    throw new Error("导演身份分配缺少 assignments 数组。");
  }

  const participantByKey = new Map(participants.map((participant) => [participantKey(participant), participant]));
  const roleById = new Map(roleAssignment.rolePool.map((role) => [role.id, role]));
  const roleLimits = new Map(roleAssignment.rolePool.map((role) => [role.id, Math.max(1, Math.round(role.count || 1))]));
  const roleCounts = new Map<string, number>();
  const seenParticipants = new Set<string>();
  const selections: TavernRoleAssignmentSelection[] = [];

  for (const candidate of parsed.assignments) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const targetType = record.targetType === "user" ? "user" : record.targetType === "character" ? "character" : "";
    const rawCharacterId = typeof record.characterId === "string" ? record.characterId.trim() : "";
    const key = targetType === "user" ? "user:user" : targetType === "character" ? `character:${rawCharacterId}` : "";
    const roleId = typeof record.roleId === "string" ? record.roleId.trim() : "";
    const participant = participantByKey.get(key);
    const role = roleById.get(roleId);

    if (!participant || !role || seenParticipants.has(key)) {
      continue;
    }

    const nextRoleCount = (roleCounts.get(role.id) ?? 0) + 1;
    if (nextRoleCount > (roleLimits.get(role.id) ?? 0)) {
      continue;
    }

    roleCounts.set(role.id, nextRoleCount);
    seenParticipants.add(key);
    selections.push({ participant, role });
  }

  const missingParticipants = participants.filter((participant) => !seenParticipants.has(participantKey(participant)));
  const invalidRoleCounts = roleAssignment.rolePool.filter((role) =>
    (roleCounts.get(role.id) ?? 0) !== Math.max(1, Math.round(role.count || 1))
  );
  if (missingParticipants.length > 0 || invalidRoleCounts.length > 0 || selections.length !== participants.length) {
    throw new Error([
      "导演身份分配不完整。",
      missingParticipants.length ? `missing=${missingParticipants.map((item) => item.label).join(",")}` : "",
      invalidRoleCounts.length ? `invalidRoles=${invalidRoleCounts.map((role) => role.id).join(",")}` : "",
    ].filter(Boolean).join(" "));
  }

  const openingNarrator = typeof parsed.openingNarrator === "string"
    ? parsed.openingNarrator.trim().slice(0, 240)
    : "";
  const dayAnnouncement = typeof parsed.dayAnnouncement === "string"
    ? parsed.dayAnnouncement.trim().slice(0, 360)
    : "";
  const publicFact = typeof parsed.publicFact === "string"
    ? parsed.publicFact.trim().slice(0, 240)
    : "";

  return {
    factEvents: createTavernRoleAssignmentFactEvents({
      room,
      assignments: selections,
      turnId,
      createdAt,
    }),
    openingNarrator,
    dayAnnouncement,
    publicFact,
    rawText: text,
  };
};

export const runTavernDirectorRoleAssignment = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
}: {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
}): Promise<TavernDirectorRoleAssignment> => {
  const roleAssignment = room.settings.informationPolicy.roleAssignment;
  const participants = createParticipants(room, characters);
  const rolePool = expandRolePool(roleAssignment.rolePool);
  const turnId = `director-role-assignment-${Date.now().toString(36)}`;
  const createdAt = Date.now();
  const prompt = [
    "<output_schema>",
    `{"assignments":[{"targetType":"user","characterId":"","roleId":"role-id"},{"targetType":"character","characterId":"character-id","roleId":"role-id"}],"openingNarrator":"公开开场，不泄露身份","dayAnnouncement":"第二天清晨公布的公开事实，不泄露隐藏身份","publicFact":"一句可记录的首夜公开事实"}`,
    "</output_schema>",
    "",
    "<constraints>",
    "你是主持制互动剧本的导演。现在需要实时生成本局身份分配。",
    "assignments 必须覆盖每个参与者一次且仅一次。",
    "roleId 必须来自 role_pool，并严格满足每个角色 count 展开后的数量。",
    "用户也是参与者；targetType=user 时 characterId 必须为空字符串。",
    "角色参与者 targetType=character，characterId 必须使用 participants 中给出的 id。",
    "openingNarrator、dayAnnouncement、publicFact 都是公开信息，严禁写出任何人的身份、阵营、夜间私密行动、验人结果或心理。",
    "dayAnnouncement 应表现为首夜已经发生并进入第二天的公开结果，例如有人失踪、无人死亡、钟声异常或公开可观察线索；不要直接解决主线。",
    "只输出严格合法 JSON 对象，不要 Markdown，不要代码块。",
    "</constraints>",
    "",
    `<room title="${room.title}">`,
    room.storyOutline.trim(),
    room.storyGoal.trim() ? `终局目标：${room.storyGoal.trim()}` : "",
    room.scene.trim(),
    "</room>",
    "",
    "<participants>",
    participants.map((participant) =>
      participant.isUser
        ? `targetType: user\ncharacterId: \nname: ${participant.label}`
        : `targetType: character\ncharacterId: ${participant.characterId}\nname: ${participant.label}`
    ).join("\n\n---\n\n"),
    "</participants>",
    "",
    "<role_pool>",
    roleAssignment.rolePool.map((role) => [
      `roleId: ${role.id}`,
      `label: ${role.label}`,
      `count: ${Math.max(1, Math.round(role.count || 1))}`,
      role.factionId ? `factionId: ${role.factionId}` : "",
      role.factionLabel ? `factionLabel: ${role.factionLabel}` : "",
      role.description ? `description: ${role.description}` : "",
    ].filter(Boolean).join("\n")).join("\n\n---\n\n"),
    "</role_pool>",
    "",
    `<expanded_role_count>${rolePool.length}</expanded_role_count>`,
  ].filter(Boolean).join("\n");

  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room.id),
    agentRoleId: tavernDirectorAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请为本局实时分配身份，并输出严格合法 JSON。",
    requestContext: prompt,
    runtimeInstruction: [
      "你是酒馆主持制剧本的导演 Agent。",
      "本轮只做开局身份分配和首夜公开结果生成，不安排角色公开发言。",
      "身份和阵营只写入 assignments 结构，不得出现在公开旁白字段。",
      "必须严格按 schema 输出 JSON。",
    ].join("\n"),
  });

  return parseTavernDirectorRoleAssignmentText({
    text: result.text,
    room,
    characters,
    turnId,
    createdAt,
  });
};

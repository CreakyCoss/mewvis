import type {
  TavernCharacter,
  TavernRoom,
} from "../../../types";
import {
  createTavernRoleAssignmentParticipants,
  expandTavernRoleAssignmentPool,
} from "./participants";

export const buildTavernDirectorRoleAssignmentPrompt = ({
  room,
  characters,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
}) => {
  const roleAssignment = room.settings.informationPolicy.roleAssignment;
  const participants = createTavernRoleAssignmentParticipants(room, characters);
  const rolePool = expandTavernRoleAssignmentPool(roleAssignment.rolePool);

  return [
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
};

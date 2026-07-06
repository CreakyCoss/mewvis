import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { tavernBridgeSessionRootDir, tavernDirectorAgentRoleId } from "../../core";
import { buildTavernBridgeSystemPrompt } from "../conversation";
import { runTavernRuntimeAgent } from "../agent";
import { parseTavernDirectorRoleAssignmentText } from "./role-assignment/parsing";
import { buildTavernDirectorRoleAssignmentPrompt } from "./role-assignment/prompt";
import type { TavernDirectorRoleAssignment } from "./role-assignment/types";

export { parseTavernDirectorRoleAssignmentText } from "./role-assignment/parsing";
export type { TavernDirectorRoleAssignment } from "./role-assignment/types";

export const runTavernDirectorRoleAssignment = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
}: {
  workspacePath: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
}): Promise<TavernDirectorRoleAssignment> => {
  const turnId = `director-role-assignment-${Date.now().toString(36)}`;
  const createdAt = Date.now();
  const prompt = buildTavernDirectorRoleAssignmentPrompt({ room, characters });

  const result = await runTavernRuntimeAgent({
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
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

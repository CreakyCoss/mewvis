import type { AgentRuntimeNativeSession, AgentRunCommand, RuntimeAgentCommand } from "../runtimes/types.js";
import { createAgentSessionPlan } from "../artifacts.js";
import { inferCommandTurnId, withSessionLink } from "../../session/model/runtime-link.js";
import { createRuntimeSessionManager } from "../../session/index.js";
import { agentRunUserMessage, buildAgentTaskPrompt } from "../prompt.js";
import type { RuntimeSessionProviderId } from "../../session/providers/types.js";

export type PreparedRuntimeAgentRun = {
  command: RuntimeAgentCommand;
  nativeSession?: AgentRuntimeNativeSession;
};

export type PrepareRuntimeAgentRunOptions = {
  sessionProviderId?: RuntimeSessionProviderId | null;
};

const resolveAgentRunRoleKey = (command: AgentRunCommand) => {
  const agentKey = command.agentRoleId?.trim();
  if (!agentKey) {
    throw new Error("agent 消息使用 runtime session 时必须提供 agentRoleId 作为稳定 agent 角色 id");
  }
  return agentKey;
};

const nativeSessionFor = (
  sessionManager: ReturnType<typeof createRuntimeSessionManager>,
): AgentRuntimeNativeSession => ({
  readSession: () => sessionManager.readSession(),
  readAgentVisibleContext: (input) => sessionManager.readAgentVisibleContext(input),
});

export const prepareRuntimeAgentRun = async (
  command: AgentRunCommand,
  runtimeId: string,
  options: PrepareRuntimeAgentRunOptions = {},
): Promise<PreparedRuntimeAgentRun> => {
  const userMessage = agentRunUserMessage(command);
  if (!command.sessionRootDir?.trim()) {
    const runtimeCommand = withSessionLink(
      {
        ...command,
        userMessage,
        recordUserMessage: true,
        agentTaskPrompt: userMessage,
        sessionBootstrapContext: null,
        nativeSessionContextRef: null,
        bootstrapInstruction: command.bootstrapInstruction ?? null,
      },
      { turnId: inferCommandTurnId(command) },
    );

    return {
      command: {
        ...runtimeCommand,
        agentTaskPrompt: [runtimeCommand.systemPrompt?.trim() || "", buildAgentTaskPrompt(runtimeCommand, userMessage)]
          .filter(Boolean)
          .join("\n\n"),
      },
    };
  }

  const sessionManager = createRuntimeSessionManager({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    providerId: options.sessionProviderId,
  });
  const commandWithRuntime = {
    ...command,
    runtimeId,
  };
  const preparedTurn = await sessionManager.prepareTurn(commandWithRuntime, {
    includeSummary: false,
    preserveRecordUserMessageFalse: true,
  });
  if (!preparedTurn) {
    throw new Error("agent 消息启用 runtime session 时必须提供 workspacePath 和 sessionRootDir");
  }
  const commandWithTurn = preparedTurn.command;

  const sessionPlan = await createAgentSessionPlan({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    sessionProviderId: options.sessionProviderId,
    runtimeId,
    agentRoleId: resolveAgentRunRoleKey(command),
  });
  const anchorRecordId = preparedTurn.runtimeParentRecordId ?? preparedTurn.contextAnchorId;

  return {
    command: {
      ...commandWithTurn,
      runtimeId,
      systemPrompt: preparedTurn.systemPrompt,
      agentRoleId: sessionPlan.agentRoleId,
      userMessage,
      agentTaskPrompt: buildAgentTaskPrompt(commandWithTurn, userMessage),
      sessionBootstrapContext: null,
      nativeSessionContextRef: {
        agentRoleId: sessionPlan.agentRoleId,
        anchorRecordId,
      },
      bootstrapInstruction: commandWithTurn.bootstrapInstruction ?? null,
      agentSessionDir: sessionPlan.agentSessionDir,
    },
    nativeSession: nativeSessionFor(sessionManager),
  };
};

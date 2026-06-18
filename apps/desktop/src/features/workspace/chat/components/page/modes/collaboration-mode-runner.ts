import {
  normalizeAllowedRuntimeAgentTools,
  type RuntimeModelInput,
  type RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import {
  runSharedAgentTask,
  type SharedAgentTaskResult,
} from "@/features/ai/runtime";
import { requireRuntimeModelInput } from "@/features/ai/components/llm-setting/store";
import type {
  AgentProfile,
  CollaborationWorkflowProfile,
  CollaborationWorkflowStepProfile,
} from "@/features/ai/components/agent-setting/types";
import type {
  ChatMessage,
  ConversationMessage,
  PromptContextLimits,
} from "../../../types";
import { applyAgentEventToMessage } from "../../../utils/agent-blocks";
import {
  createCollaborationConversationMessage,
  createCollaborationStepMessage,
  createCollaborationStepMetadata,
  createCollaborationSupervisorConversationMessage,
  createCollaborationSupervisorMessage,
  createCollaborationSupervisorMetadata,
  type CollaborationStepOutput,
  type CollaborationSupervisorOutput,
  promptPhaseForWorkflowStep,
  renderCollaborationPriorOutputs,
  renderCollaborationSupervisorOutput,
  renderCollaborationTranscript,
  visiblePhaseForWorkflowStep,
} from "../../../utils/collaboration";
import { createMessageId } from "../../../utils/sessions";
import {
  agentEventTraceStep,
  formatDebugMessages,
} from "../trace";
import type {
  AppendVisibleTraceStep,
  RunCollaborationTurnDeps,
  RunCollaborationTurnInput,
  UpdateMessage,
} from "./types";

type RunCollaborationAgentTaskInput = {
  agentRuntime: RunCollaborationTurnDeps["agentRuntime"];
  runtimeAgentId: string;
  workspacePath: string;
  sessionRootDir: string;
  agentRoleId: string;
  messageId: string;
  prompt: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  agent: AgentProfile;
  runtimeModel: RuntimeModelInput;
  allowedTools: RuntimeAgentToolName[];
  activeSkillNames: string[];
  traceTurnId: string;
  traceLabel: string;
  traceMetadata: Record<string, unknown>;
  appendVisibleTraceStep: AppendVisibleTraceStep;
  updateMessage: UpdateMessage;
};

const formatWorkflowSteps = (workflow: CollaborationWorkflowProfile) =>
  workflow.steps
    .map((step, index) => [
      `步骤 ${index + 1}/${workflow.steps.length}: ${step.name}`,
      `step_id: ${step.id}`,
      `Agent: ${step.agent.name}`,
      `阶段: ${step.phase ?? "custom"}`,
      step.instruction?.trim() ? `步骤说明: ${step.instruction.trim()}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

const stableAgentRoleId = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "collaboration-agent";

const compactSections = (sections: Array<string | null | undefined>) =>
  sections.map((section) => section?.trim() ?? "").filter(Boolean).join("\n\n");

const createPlainAssistantConversationMessage = (
  id: string,
  content: string,
): ConversationMessage => ({
  id,
  role: "assistant",
  content,
  timestamp: Date.now(),
});

type SupervisorWorkflowPlanProposal = {
  reason: string;
  proposedStepIds: string[];
  proposedSteps: CollaborationWorkflowStepProfile[];
};

const resolveRuntimeModelInput = (agent: AgentProfile) => {
  return requireRuntimeModelInput(
    agent.runtimeModel,
    `Agent「${agent.name}」绑定的模型已不可用，请重新选择模型。`,
  );
};

const workflowPlanJsonPattern = /<workflow_plan_json>\s*([\s\S]*?)\s*<\/workflow_plan_json>/i;

const uniqueStrings = (values: string[]) => [...new Set(values)];

const areSameStepIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const extractSupervisorWorkflowPlanProposal = (
  rawText: string,
  configuredSteps: CollaborationWorkflowStepProfile[],
): {
  visibleText: string;
  proposal: SupervisorWorkflowPlanProposal | null;
} => {
  const match = rawText.match(workflowPlanJsonPattern);
  const visibleText = rawText.replace(workflowPlanJsonPattern, "").trim();
  if (!match?.[1]) {
    return { visibleText, proposal: null };
  }

  try {
    const parsed = JSON.parse(match[1]) as {
      needs_change?: unknown;
      reason?: unknown;
      execution_step_ids?: unknown;
    };
    const configuredStepIds = configuredSteps.map((step) => step.id);
    const configuredStepById = new Map(configuredSteps.map((step) => [step.id, step]));
    const proposedStepIds = Array.isArray(parsed.execution_step_ids)
      ? uniqueStrings(parsed.execution_step_ids.filter((item): item is string =>
        typeof item === "string" && configuredStepById.has(item)
      ))
      : [];
    const needsChange = parsed.needs_change === true;
    if (
      proposedStepIds.length === 0 ||
      !needsChange ||
      areSameStepIds(proposedStepIds, configuredStepIds)
    ) {
      return { visibleText, proposal: null };
    }

    return {
      visibleText,
      proposal: {
        reason: typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : "主控建议调整本轮执行步骤。",
        proposedStepIds,
        proposedSteps: proposedStepIds.flatMap((stepId) => {
          const step = configuredStepById.get(stepId);
          return step ? [step] : [];
        }),
      },
    };
  } catch {
    return { visibleText, proposal: null };
  }
};

const planDecisionStepFromWorkflowStep = (
  step: CollaborationWorkflowStepProfile,
) => ({
  id: step.id,
  name: step.name,
  agentName: step.agent.name,
});

const updateCollaborationMetadata = (
  message: ChatMessage,
  patch: Partial<NonNullable<ChatMessage["collaboration"]>>,
): ChatMessage => ({
  ...message,
  collaboration: message.collaboration
    ? {
      ...message.collaboration,
      ...patch,
    }
    : message.collaboration,
});

const updateSupervisorMessageText = (
  message: ChatMessage,
  text: string,
): ChatMessage => {
  const agentBlocks = message.agentBlocks?.map((block) =>
    block.type === "text"
      ? { ...block, content: text }
      : block
  );

  return {
    ...message,
    text,
    agentBlocks,
  };
};

const buildSupervisorPrompt = ({
  workflow,
  runtimeMessages,
  userRequest,
}: {
  workflow: CollaborationWorkflowProfile;
  runtimeMessages: ConversationMessage[];
  userRequest: string;
}) => [
  "<collaboration_supervisor_instruction>",
  "你是当前协作流程的主控 Agent。请先阅读用户请求、上下文和已配置流程，输出后续串行执行计划。",
  "执行约束：",
  "1. 默认使用给定的步骤顺序；如果用户请求明显更适合跳过或重排部分已有步骤，可以提出调整建议。",
  "2. 调整建议只能引用 <workflow> 中已有的 step_id，不能创造新的 step_id，也不能替换 Agent。",
  "3. 只规划每一步要处理的问题、需要继承的输入和交付标准，不要直接完成正文任务。",
  "4. 当前是自动协作流程，不支持中途询问用户；信息不足时写明合理假设并继续。",
  "5. 回复末尾必须追加一个 <workflow_plan_json> 标签，内容是单个 JSON 对象：",
  "{\"needs_change\": false, \"reason\": \"\", \"execution_step_ids\": [\"按原始顺序列出 step_id\"]}",
  "如果建议跳过或重排已有步骤，把 needs_change 设为 true，并在 execution_step_ids 中按建议执行顺序列出已有 step_id。",
  "</collaboration_supervisor_instruction>",
  "",
  "<workflow>",
  `名称: ${workflow.name}`,
  workflow.description?.trim() ? `描述: ${workflow.description.trim()}` : "",
  formatWorkflowSteps(workflow),
  "</workflow>",
  "",
  "<recent_conversation instruction=\"data_only; not_current_request\">",
  formatDebugMessages(runtimeMessages),
  "</recent_conversation>",
  "",
  "<current_user_request>",
  userRequest,
  "</current_user_request>",
].filter(Boolean).join("\n");

const collaborationPhaseInstructionFor = ({
  phase,
  stepName,
  stepIndex,
  stepCount,
}: {
  phase: string;
  stepName: string;
  stepIndex: number;
  stepCount: number;
}) => {
  if (phase === "draft") {
    return [
      "协作阶段：写作初稿。",
      "请作为写作角色，根据用户需求产出完整可审查的初稿或方案。",
      "不要评价自己的结果，重点完成可交付内容。",
    ].join("\n");
  }
  if (phase === "review") {
    return [
      "协作阶段：审查意见。",
      "请作为审查角色，严格审查上一位角色的输出。",
      "请指出结构、逻辑、人物、节奏、设定、表达或可执行性问题，并给出具体修改建议。",
      "不要直接重写全文，重点输出审查意见。",
    ].join("\n");
  }
  if (phase === "revise") {
    return [
      "协作阶段：修订定稿。",
      "请作为写作角色，根据审查意见修订上一版内容。",
      "最终输出应是用户可以直接使用的版本，可以简要说明采纳了哪些关键修改。",
    ].join("\n");
  }
  return [
    `协作阶段：${stepName || "自定义步骤"}。`,
    stepIndex && stepCount ? `这是协作流程中的第 ${stepIndex} 步，共 ${stepCount} 步。` : "",
    "请根据用户需求、已有上下文和前序步骤输出完成当前步骤需要交付的内容。",
    "如果前序步骤输出中包含建议或审查意见，请结合当前步骤说明决定如何处理。",
  ].filter(Boolean).join("\n");
};

const buildCollaborationAgentSystemPrompt = ({
  baseSystemPrompt,
  selectedAgent,
  phase,
  collaborationInstruction,
  collaborationStepName,
  collaborationStepIndex,
  collaborationStepCount,
}: {
  baseSystemPrompt: string;
  selectedAgent: AgentProfile;
  phase: string;
  collaborationInstruction?: string | null;
  collaborationStepName: string;
  collaborationStepIndex: number;
  collaborationStepCount: number;
}) => [
  baseSystemPrompt,
  "<collaboration_agent_profile instruction=\"persona_context_only\">",
  `name: ${selectedAgent.name}`,
  selectedAgent.description ? `description: ${selectedAgent.description}` : "",
  "</collaboration_agent_profile>",
  "",
  collaborationPhaseInstructionFor({
    phase,
    stepName: collaborationStepName,
    stepIndex: collaborationStepIndex,
    stepCount: collaborationStepCount,
  }),
  collaborationInstruction?.trim()
    ? [
      "",
      "协作流程自定义说明：",
      collaborationInstruction.trim(),
    ].join("\n")
    : "",
].filter(Boolean).join("\n\n");

const selectRecentConversationForCollaboration = ({
  conversation,
  limits,
}: {
  conversation: ConversationMessage[];
  limits: PromptContextLimits;
}) => {
  const selected: ConversationMessage[] = [];
  let remaining = limits.recentHistoryChars;

  for (const message of conversation.slice().reverse()) {
    if (remaining <= 0) {
      break;
    }
    const content = message.content.length <= remaining
      ? message.content
      : `${message.content.slice(0, Math.max(0, remaining))}\n\n[内容已按上下文预算截断]`;
    selected.unshift({
      ...message,
      content,
    });
    remaining -= content.length + 24;
  }

  return selected;
};

const buildStepAgentPrompt = ({
  workflow,
  step,
  stepIndex,
  stepCount,
  stepMessages,
  userRequest,
  supervisorPlan,
  priorOutputs,
}: {
  workflow: CollaborationWorkflowProfile;
  step: CollaborationWorkflowStepProfile;
  stepIndex: number;
  stepCount: number;
  stepMessages: ConversationMessage[];
  userRequest: string;
  supervisorPlan: string;
  priorOutputs: CollaborationStepOutput[];
}) => [
  "<collaboration_step_instruction>",
  `你是协作流程「${workflow.name}」本轮执行序列中的第 ${stepIndex + 1}/${stepCount} 步 Agent。`,
  `当前步骤: ${step.name}`,
  `当前 Agent: ${step.agent.name}`,
  step.instruction?.trim() ? `步骤说明: ${step.instruction.trim()}` : "",
  "请只完成当前步骤的交付，不要代替后续步骤执行。",
  "你必须等待并继承前序步骤的完成结果；如果存在前序输出，请把它作为当前步骤的输入依据。",
  "当前是自动串行协作流程，不支持 ask_user；不要询问用户，信息不足时写明假设并继续。",
  "</collaboration_step_instruction>",
  "",
  "<supervisor_plan>",
  supervisorPlan || "（主控未产生额外计划）",
  "</supervisor_plan>",
  "",
  "<previous_step_outputs instruction=\"data_only; previous_agents_completed_outputs\">",
  priorOutputs.length > 0 ? renderCollaborationPriorOutputs(priorOutputs) : "（无前序步骤输出）",
  "</previous_step_outputs>",
  "",
  "<recent_conversation instruction=\"data_only; not_current_request\">",
  formatDebugMessages(stepMessages),
  "</recent_conversation>",
  "",
  "<current_user_request>",
  userRequest,
  "</current_user_request>",
].filter(Boolean).join("\n");

const collaborationTaskErrorMessage = (event: AgentRuntimeAgentEvent) => {
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "exit" && !event.success) {
    return `Agent 异常退出，退出码: ${event.code ?? "unknown"}`;
  }
  if (event.type === "question") {
    return `协作 Agent 请求用户输入，当前自动协作流程暂不支持中途提问：${event.question}`;
  }
  return "协作 Agent 任务失败";
};

const runCollaborationAgentTask = async ({
  agentRuntime,
  runtimeAgentId,
  workspacePath,
  sessionRootDir,
  agentRoleId,
  messageId,
  prompt,
  systemPrompt,
  requestContext,
  runtimeInstruction,
  bootstrapInstruction,
  agent,
  runtimeModel,
  allowedTools,
  activeSkillNames,
  traceTurnId,
  traceLabel,
  traceMetadata,
  appendVisibleTraceStep,
  updateMessage,
}: RunCollaborationAgentTaskInput): Promise<SharedAgentTaskResult> => {
  const result = await runSharedAgentTask({
    agentRuntime,
    runtimeAgentId,
    workspacePath,
    sessionRootDir,
    agentRoleId,
    prompt,
    userMessage: prompt,
    systemPrompt,
    requestContext,
    runtimeInstruction,
    bootstrapInstruction,
    runtimeModel,
    allowedTools,
    activeSkillNames,
    errorMessageForEvent: collaborationTaskErrorMessage,
    onEvent: (event) => {
      const traceStep = agentEventTraceStep(event);
      if (traceStep) {
        appendVisibleTraceStep(traceTurnId, {
          ...traceStep,
          metadata: {
            ...(traceStep.metadata ?? {}),
            ...traceMetadata,
            messageId,
          },
        });
      }

      updateMessage(messageId, (message) =>
        applyAgentEventToMessage(message, event).message
      );

      if (event.type === "exit" && event.success) {
        updateMessage(messageId, (message) => ({
          ...message,
          status: "done",
        }));
      }
    },
    onTaskCreated: ({ taskId, startedAt, endedAt }) => {
      appendVisibleTraceStep(traceTurnId, {
        type: "agent_event",
        label: `${traceLabel}任务创建`,
        startedAt,
        endedAt,
        status: "done",
        metadata: {
          ...traceMetadata,
          taskId,
          messageId,
          runtimeAgentId,
          agentId: agent.id,
          agentName: agent.name,
          allowedTools,
          activeSkills: activeSkillNames,
        },
      });
    },
  });

  if (result.bridgeSession?.assistantMessageRecordId) {
    updateMessage(messageId, (message) => ({
      ...message,
      bridgeMessageRecordId: result.bridgeSession?.assistantMessageRecordId ?? message.bridgeMessageRecordId,
    }));
  }

  return result;
};

export const runCollaborationTurn = async (
  {
    collaborationWorkflow,
    traceTurnId,
    text,
    nextConversation,
    runtimeMessages,
    summaryLimits,
    sessionRootDir,
    baseSystemPrompt,
    baseRequestContext,
    baseRuntimeInstruction,
    finalizeAssistantTurn,
  }: RunCollaborationTurnInput,
  {
    workspace,
    activeSkills,
    runtimeAgentId,
    agentRuntime,
    allowedAgentTools,
    appendMessage,
    requestCollaborationPlanDecision,
    appendVisibleTraceStep,
    updateMessage,
    setChatError,
    setCollaborationPhase,
  }: RunCollaborationTurnDeps,
) => {
  const configuredSteps = collaborationWorkflow.steps;
  if (configuredSteps.length === 0) {
    setChatError("协作流程没有可执行步骤");
    return;
  }

  const activeSkillNames = activeSkills.map((skill) => skill.name);
  const allowedToolsForStepRuns = normalizeAllowedRuntimeAgentTools(allowedAgentTools)
    .filter((tool) => tool !== "ask_user");
  const stepOutputs: CollaborationStepOutput[] = [];
  const collaborationRunId = `${traceTurnId}:collaboration`;
  const supervisorAgent = collaborationWorkflow.writerAgent;
  const supervisorMessageId = createMessageId();
  const supervisorMetadata = createCollaborationSupervisorMetadata({
    runId: collaborationRunId,
    workflow: collaborationWorkflow,
  });
  let supervisorConversation: CollaborationSupervisorOutput;
  let executionSteps = configuredSteps;
  let supervisorPlanDecision: "not_required" | "approved" | "rejected" = "not_required";
  let supervisorProposedStepIds: string[] | undefined;

  setCollaborationPhase("drafting");
  appendMessage(createCollaborationSupervisorMessage({
    id: supervisorMessageId,
    createdAt: Date.now(),
    metadata: supervisorMetadata,
  }));

  const supervisorAgentInstruction = buildCollaborationAgentSystemPrompt({
    baseSystemPrompt: "",
    selectedAgent: supervisorAgent,
    phase: "custom",
    collaborationInstruction: [
      "你是协作主控 Agent，负责把已配置协作流程整理成严格串行的执行计划。",
      "不要执行各步骤的正文任务，只输出计划、输入传递关系和每步验收标准。",
    ].join("\n"),
    collaborationStepName: "主控规划",
    collaborationStepIndex: 0,
    collaborationStepCount: configuredSteps.length,
  });
  const supervisorRuntimeInstruction = compactSections([
    baseRuntimeInstruction,
    supervisorAgentInstruction,
  ]);
  const supervisorPrompt = buildSupervisorPrompt({
    workflow: collaborationWorkflow,
    runtimeMessages,
    userRequest: text,
  });
  const supervisorStartedAt = Date.now();
  appendVisibleTraceStep(traceTurnId, {
    type: "request",
    label: "主控 Agent 规划请求",
    status: "done",
    content: supervisorPrompt,
    metadata: {
      collaborationRunId,
      role: "supervisor",
      messageId: supervisorMessageId,
      agentId: supervisorAgent.id,
      agentName: supervisorAgent.name,
      providerName: supervisorAgent.runtimeModel.provider.name,
      modelName: supervisorAgent.runtimeModel.modelName,
      allowedTools: [],
      stream: true,
    },
    payloads: [
      {
        label: "runtime messages",
        content: formatDebugMessages(runtimeMessages),
      },
      {
        label: "requestContext",
        content: baseRequestContext,
      },
    ],
  });

  let supervisorPlan = "";
  try {
    const supervisorResult = await runCollaborationAgentTask({
      agentRuntime,
      runtimeAgentId,
      workspacePath: workspace.path,
      sessionRootDir,
      agentRoleId: stableAgentRoleId("collab", collaborationWorkflow.id, "supervisor", supervisorAgent.id),
      messageId: supervisorMessageId,
      prompt: supervisorPrompt,
      systemPrompt: baseSystemPrompt,
      requestContext: baseRequestContext,
      runtimeInstruction: supervisorRuntimeInstruction,
      agent: supervisorAgent,
      runtimeModel: resolveRuntimeModelInput(supervisorAgent),
      allowedTools: [],
      activeSkillNames,
      traceTurnId,
      traceLabel: "主控 Agent ",
      traceMetadata: {
        collaborationRunId,
        role: "supervisor",
        providerName: supervisorAgent.runtimeModel.provider.name,
        modelName: supervisorAgent.runtimeModel.modelName,
      },
      appendVisibleTraceStep,
      updateMessage,
    });
    const extractedSupervisorPlan = extractSupervisorWorkflowPlanProposal(
      supervisorResult.text.trim(),
      configuredSteps,
    );
    supervisorPlan = extractedSupervisorPlan.visibleText ||
      "按已配置流程顺序串行执行。每一步必须等待前一步完成，并把前序输出作为下一步输入。";
    appendVisibleTraceStep(traceTurnId, {
      type: "response",
      label: "主控 Agent 规划结果",
      startedAt: supervisorStartedAt,
      endedAt: Date.now(),
      status: "done",
      content: supervisorPlan,
      metadata: {
        collaborationRunId,
        role: "supervisor",
        taskId: supervisorResult.taskId,
        messageId: supervisorMessageId,
        agentId: supervisorAgent.id,
        agentName: supervisorAgent.name,
        thinkingLength: supervisorResult.thinking?.length ?? 0,
        textLength: supervisorPlan.length,
      },
      payloads: supervisorResult.thinking
        ? [{ label: "thinking", content: supervisorResult.thinking }]
        : undefined,
    });
    updateMessage(supervisorMessageId, (message) => updateCollaborationMetadata(
      updateSupervisorMessageText({
        ...message,
        thinking: supervisorResult.thinking,
        status: "done",
      }, supervisorPlan),
      {
        planDecision: extractedSupervisorPlan.proposal ? "pending" : "not_required",
        proposedStepIds: extractedSupervisorPlan.proposal?.proposedStepIds,
      },
    ));

    if (extractedSupervisorPlan.proposal) {
      const proposal = extractedSupervisorPlan.proposal;
      supervisorProposedStepIds = proposal.proposedStepIds;
      appendVisibleTraceStep(traceTurnId, {
        type: "response",
        label: "主控流程调整建议",
        status: "done",
        content: proposal.reason,
        metadata: {
          collaborationRunId,
          role: "supervisor",
          messageId: supervisorMessageId,
          proposedStepIds: proposal.proposedStepIds,
          configuredStepIds: configuredSteps.map((step) => step.id),
        },
      });
      const approved = await requestCollaborationPlanDecision({
        messageId: supervisorMessageId,
        workflowName: collaborationWorkflow.name,
        reason: proposal.reason,
        configuredSteps: configuredSteps.map(planDecisionStepFromWorkflowStep),
        proposedSteps: proposal.proposedSteps.map(planDecisionStepFromWorkflowStep),
      });
      executionSteps = approved ? proposal.proposedSteps : configuredSteps;
      supervisorPlanDecision = approved ? "approved" : "rejected";
      const decisionText = approved
        ? "执行确认：已采用主控建议，本轮将按调整后的步骤执行。"
        : "执行确认：继续使用原配置流程。";
      supervisorPlan = [supervisorPlan, decisionText].filter(Boolean).join("\n\n");
      appendVisibleTraceStep(traceTurnId, {
        type: "response",
        label: "主控流程调整确认",
        status: "done",
        content: decisionText,
        metadata: {
          collaborationRunId,
          role: "supervisor",
          messageId: supervisorMessageId,
          approved,
          executedStepIds: executionSteps.map((step) => step.id),
          proposedStepIds: proposal.proposedStepIds,
        },
      });
      updateMessage(supervisorMessageId, (message) => updateCollaborationMetadata(
        updateSupervisorMessageText(message, supervisorPlan),
        {
          planDecision: approved ? "approved" : "rejected",
          proposedStepIds: proposal.proposedStepIds,
          executedStepIds: executionSteps.map((step) => step.id),
        },
      ));
    }
  } catch (caught) {
    const message = String(caught);
    updateMessage(supervisorMessageId, (currentMessage) => ({
      ...currentMessage,
      text: currentMessage.text.trim()
        ? `${currentMessage.text}\n\n${message}`
        : message,
      status: "error",
    }));
    throw caught;
  }

  supervisorConversation = {
    messageId: supervisorMessageId,
    agentName: supervisorAgent.name,
    text: supervisorPlan,
    metadata: {
      ...supervisorMetadata,
      planDecision: supervisorPlanDecision,
      proposedStepIds: supervisorProposedStepIds,
      executedStepIds: executionSteps.map((step) => step.id),
    },
  };
  const supervisorConversationMessage = createCollaborationSupervisorConversationMessage(
    supervisorConversation,
  );

  for (const [index, step] of executionSteps.entries()) {
    const promptPhase = promptPhaseForWorkflowStep(step);
    setCollaborationPhase(visiblePhaseForWorkflowStep(step, index, executionSteps.length));
    const stepMessageId = createMessageId();
    const stepMetadata = createCollaborationStepMetadata({
      runId: collaborationRunId,
      workflow: collaborationWorkflow,
      step,
      stepIndex: index + 1,
      stepCount: executionSteps.length,
    });
    appendMessage(createCollaborationStepMessage({
      id: stepMessageId,
      createdAt: Date.now(),
      metadata: stepMetadata,
    }));
    const stepConversation = [
      ...nextConversation,
      supervisorConversationMessage,
      ...(stepOutputs.length > 0
        ? [createPlainAssistantConversationMessage(
          createMessageId(),
          `协作流程前序步骤输出：\n\n${renderCollaborationPriorOutputs(stepOutputs)}`,
        )]
        : []),
    ];
    const stepMessages = selectRecentConversationForCollaboration({
      conversation: stepConversation,
      limits: summaryLimits,
    });
    const stepAgentInstruction = buildCollaborationAgentSystemPrompt({
      baseSystemPrompt: "",
      selectedAgent: step.agent,
      phase: promptPhase,
      collaborationInstruction: step.instruction,
      collaborationStepName: step.name,
      collaborationStepIndex: index + 1,
      collaborationStepCount: executionSteps.length,
    });
    const stepRuntimeInstruction = compactSections([
      baseRuntimeInstruction,
      stepAgentInstruction,
    ]);
    const stepPrompt = buildStepAgentPrompt({
      workflow: collaborationWorkflow,
      step,
      stepIndex: index,
      stepCount: executionSteps.length,
      stepMessages,
      userRequest: text,
      supervisorPlan,
      priorOutputs: stepOutputs,
    });
    const stepStartedAt = Date.now();
    appendVisibleTraceStep(traceTurnId, {
      type: "request",
      label: `${step.name} Agent 请求`,
      status: "done",
      content: stepPrompt,
      metadata: {
        collaborationRunId,
        phase: promptPhase,
        stepIndex: index + 1,
        stepName: step.name,
        stepMessageId,
        agentId: step.agent.id,
        agentName: step.agent.name,
        providerName: step.agent.runtimeModel.provider.name,
        modelName: step.agent.runtimeModel.modelName,
        allowedTools: allowedToolsForStepRuns,
        stream: true,
      },
      payloads: [
        {
          label: "messages",
          content: formatDebugMessages(stepMessages),
        },
        {
          label: "requestContext",
          content: baseRequestContext,
        },
        {
          label: "previous step outputs",
          content: stepOutputs.length > 0
            ? renderCollaborationPriorOutputs(stepOutputs)
            : "（无）",
        },
      ],
    });

    let stepResult: SharedAgentTaskResult;
    try {
      stepResult = await runCollaborationAgentTask({
        agentRuntime,
        runtimeAgentId,
        workspacePath: workspace.path,
        sessionRootDir,
        agentRoleId: stableAgentRoleId(
          "collab",
          collaborationWorkflow.id,
          "step",
          step.id,
          step.agent.id,
        ),
        messageId: stepMessageId,
        prompt: stepPrompt,
        systemPrompt: baseSystemPrompt,
        requestContext: baseRequestContext,
        runtimeInstruction: stepRuntimeInstruction,
        agent: step.agent,
        runtimeModel: resolveRuntimeModelInput(step.agent),
        allowedTools: allowedToolsForStepRuns,
        activeSkillNames,
        traceTurnId,
        traceLabel: `${step.name} Agent `,
        traceMetadata: {
          collaborationRunId,
          phase: promptPhase,
          stepIndex: index + 1,
          stepName: step.name,
          agentId: step.agent.id,
          agentName: step.agent.name,
          providerName: step.agent.runtimeModel.provider.name,
          modelName: step.agent.runtimeModel.modelName,
        },
        appendVisibleTraceStep,
        updateMessage,
      });
    } catch (caught) {
      const message = String(caught);
      updateMessage(stepMessageId, (currentMessage) => ({
        ...currentMessage,
        text: currentMessage.text.trim()
          ? `${currentMessage.text}\n\n${message}`
          : message,
        status: "error",
      }));
      throw caught;
    }

    const stepText = stepResult.text.trim();
    const stepThinking = stepResult.thinking?.trim() || undefined;
    stepOutputs.push({
      step,
      messageId: stepMessageId,
      text: stepText,
      thinking: stepThinking,
      metadata: stepMetadata,
    });
    appendVisibleTraceStep(traceTurnId, {
      type: "response",
      label: `${step.name} Agent 响应`,
      startedAt: stepStartedAt,
      endedAt: Date.now(),
      status: "done",
      content: stepText,
      metadata: {
        collaborationRunId,
        phase: promptPhase,
        taskId: stepResult.taskId,
        stepIndex: index + 1,
        stepName: step.name,
        stepMessageId,
        agentId: step.agent.id,
        agentName: step.agent.name,
        thinkingLength: stepThinking?.length ?? 0,
        textLength: stepText.length,
      },
      payloads: stepThinking
        ? [{ label: "thinking", content: stepThinking }]
        : undefined,
    });
    updateMessage(stepMessageId, (message) => ({
      ...message,
      text: stepText,
      thinking: stepThinking,
      status: "done",
    }));
  }

  const collaborationText = [
    renderCollaborationSupervisorOutput(supervisorAgent.name, supervisorPlan),
    renderCollaborationTranscript(stepOutputs),
  ].filter((section) => section.trim()).join("\n\n");
  if (!stepOutputs.some((output) => output.text.trim())) {
    setChatError("协作流程没有生成结果");
    return;
  }

  await finalizeAssistantTurn({
    mode: "collab",
    assistantText: collaborationText,
    assistantMessages: [
      supervisorConversationMessage,
      ...stepOutputs.map(createCollaborationConversationMessage),
    ],
  });
};

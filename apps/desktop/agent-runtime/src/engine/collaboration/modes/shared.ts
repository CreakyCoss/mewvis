import type {
  CollaborationAgentRole,
  CollaborationRunInput,
} from "../contracts/index.js";
import type {
  CollaborationModeParticipant,
  CollaborationModeRunInput,
} from "./contracts.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const numberValue = (value: unknown, fallback: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const positiveIntegerOption = (
  options: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
) => Math.max(1, Math.floor(numberValue(options?.[key], fallback)));

export const participantsByKind = (
  input: CollaborationModeRunInput,
  kind: CollaborationModeParticipant["kind"],
) => input.participants.filter((participant) => participant.kind === kind);

export const requireParticipant = (
  input: CollaborationModeRunInput,
  kind: CollaborationModeParticipant["kind"],
) => {
  const participant = participantsByKind(input, kind)[0];
  if (!participant) {
    throw new Error(`协作模式 ${input.mode} 缺少 ${kind} participant`);
  }
  return participant;
};

export const participantToAgentRole = (
  participant: CollaborationModeParticipant,
): CollaborationAgentRole => ({
  id: participant.id,
  label: participant.label?.trim() || participant.id,
  agentId: participant.agentId ?? null,
  systemPrompt: participant.systemPrompt ?? participant.instruction ?? null,
  runtimeModel: participant.runtimeModel ?? null,
  allowedTools: participant.allowedTools,
  enabledSkills: participant.enabledSkills,
  resources: participant.resources ?? null,
});

export const modeWorkflowId = (
  modeId: string,
  requestId: string | null | undefined,
) => requestId?.trim() || `${modeId}.workflow`;

export const modeMetadata = (
  input: CollaborationModeRunInput,
  extra: Record<string, unknown> = {},
) => ({
  modeId: input.mode,
  modeOptions: input.options ?? null,
  ...extra,
});

export const createModeRunInput = (
  input: CollaborationModeRunInput,
  run: Omit<CollaborationRunInput, "requestId" | "workspacePath" | "sessionRootDir" | "resources">,
): CollaborationRunInput => ({
  requestId: input.requestId ?? null,
  workspacePath: input.workspacePath,
  sessionRootDir: input.sessionRootDir ?? null,
  resources: input.resources ?? null,
  ...run,
});

export const renderContextBlock = (context: unknown) =>
  typeof context === "string"
    ? context
    : context === null || context === undefined
    ? ""
    : JSON.stringify(context, null, 2);

export const parseJsonObjectFromText = (text: string): Record<string, unknown> => {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : {};
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      return {};
    }
    try {
      const parsed = JSON.parse(match[0]);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
};

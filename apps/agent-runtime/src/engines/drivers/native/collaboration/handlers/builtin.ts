import type { CollaborationAgentInvocation } from "../runtimes/shared/step.js";
import type { CollaborationHandlerBundle } from "./types.js";
import { isRecord, numberValue, parseJsonObjectFromText, stringValue } from "../modes/shared.js";

type SupervisorCandidate = {
  targetId: string;
  score: number;
  reason?: string | null;
  instruction?: string | null;
};

type SupervisorDecision = {
  status: "continue" | "complete" | "blocked";
  candidates: SupervisorCandidate[];
  selectedTargetId?: string | null;
  selectedInstruction?: string | null;
  reason?: string | null;
  artifacts?: unknown[];
};

type DispatchCandidate = {
  targetId: string;
  invocation: CollaborationAgentInvocation;
};

type ReviewDecision = {
  status: "approved" | "revise" | "blocked";
  score?: number | null;
  reason?: string | null;
  revisionInstruction?: string | null;
};

const normalizeRound = (input: unknown) => {
  const value = isRecord(input) ? (input.current ?? input.round) : input;
  return Math.max(0, Math.floor(numberValue(value, 0)));
};

const normalizeSupervisorCandidate = (value: unknown): SupervisorCandidate | null => {
  if (!isRecord(value)) {
    return null;
  }
  const targetId =
    stringValue(value.targetId) ??
    stringValue(value.id) ??
    stringValue(value.participantId) ??
    stringValue(value.agentRoleId);
  if (!targetId) {
    return null;
  }
  return {
    targetId,
    score: Math.max(0, Math.min(100, numberValue(value.score ?? value.priority ?? value.confidence, 0))),
    reason: stringValue(value.reason),
    instruction: stringValue(value.instruction) ?? stringValue(value.task),
  };
};

const normalizeSupervisorDecision = (input: unknown): SupervisorDecision => {
  const record = isRecord(input) ? input : {};
  const raw =
    typeof record.raw === "string"
      ? record.raw
      : typeof record.text === "string"
        ? record.text
        : typeof input === "string"
          ? input
          : "";
  const parsed = raw.trim() ? parseJsonObjectFromText(raw) : record;
  const rawStatus = stringValue(parsed.status);
  const status = rawStatus === "complete" ? "complete" : rawStatus === "blocked" ? "blocked" : "continue";
  const normalizedCandidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.flatMap((candidate) => {
        const normalized = normalizeSupervisorCandidate(candidate);
        return normalized ? [normalized] : [];
      })
    : [];
  const selectedTargetId = stringValue(parsed.selectedTargetId);
  const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];

  return {
    status,
    candidates: normalizedCandidates,
    selectedTargetId,
    selectedInstruction:
      stringValue(parsed.selectedInstruction) ?? stringValue(parsed.instruction) ?? stringValue(parsed.task),
    reason: stringValue(parsed.reason),
    artifacts,
  };
};

const normalizeDispatchCandidates = (value: unknown): DispatchCandidate[] =>
  Array.isArray(value)
    ? value.flatMap((candidate): DispatchCandidate[] => {
        if (!isRecord(candidate)) {
          return [];
        }
        const targetId = stringValue(candidate.targetId);
        const invocation = isRecord(candidate.invocation)
          ? (candidate.invocation as Partial<CollaborationAgentInvocation>)
          : null;
        if (
          !targetId ||
          !invocation ||
          typeof invocation.agentRoleId !== "string" ||
          typeof invocation.userMessage !== "string"
        ) {
          return [];
        }
        return [
          {
            targetId,
            invocation: invocation as CollaborationAgentInvocation,
          },
        ];
      })
    : [];

const invocationAliasIds = (candidate: DispatchCandidate) => {
  const metadata = isRecord(candidate.invocation.metadata) ? candidate.invocation.metadata : {};
  return [
    candidate.targetId,
    stringValue(metadata.targetId),
    stringValue(metadata.characterId),
    ...(Array.isArray(metadata.targetAliases)
      ? metadata.targetAliases.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
      : []),
  ].filter((item): item is string => Boolean(item));
};

const findDispatchCandidate = (dispatchCandidates: DispatchCandidate[], targetId: string) =>
  dispatchCandidates.find((candidate) => invocationAliasIds(candidate).includes(targetId));

const selectSupervisorDispatch = (input: unknown) => {
  const record = isRecord(input) ? input : {};
  const decision = normalizeSupervisorDecision(record.decision);
  const dispatchCandidates = normalizeDispatchCandidates(record.dispatchCandidates);
  const minScore = Math.max(0, Math.min(100, numberValue(record.minScore, 1)));
  const round = normalizeRound(record.round);
  const allowNoDispatch = record.allowNoDispatch !== false;
  const explicitDispatchCandidate = decision.selectedTargetId
    ? findDispatchCandidate(dispatchCandidates, decision.selectedTargetId)
    : null;
  const selectedFromDecision = decision.selectedTargetId
    ? (decision.candidates.find((candidate) => candidate.targetId === decision.selectedTargetId) ??
      decision.candidates.find(
        (candidate) =>
          explicitDispatchCandidate &&
          findDispatchCandidate(dispatchCandidates, candidate.targetId)?.targetId ===
            explicitDispatchCandidate.targetId,
      ))
    : null;
  const selectedFromExplicitTarget =
    explicitDispatchCandidate && !selectedFromDecision
      ? {
          targetId: explicitDispatchCandidate.targetId,
          score: 100,
          reason: decision.reason,
          instruction: decision.selectedInstruction,
        }
      : null;
  const selected =
    selectedFromDecision ??
    selectedFromExplicitTarget ??
    decision.candidates
      .filter((candidate) => findDispatchCandidate(dispatchCandidates, candidate.targetId))
      .sort((left, right) => right.score - left.score)[0] ??
    null;

  if (decision.status !== "continue" || !selected || selected.score < minScore) {
    return {
      route: "end",
      decision,
      selected: null,
      invocations: [],
      reason:
        !selected && !allowNoDispatch
          ? "dispatch target required but missing"
          : decision.status !== "continue"
            ? `supervisor status is ${decision.status}`
            : selected && selected.score < minScore
              ? `selected score ${selected.score} is below minScore ${minScore}`
              : "no dispatch target selected",
    };
  }

  const dispatchCandidate = findDispatchCandidate(dispatchCandidates, selected.targetId);
  if (!dispatchCandidate) {
    return {
      route: "end",
      decision,
      selected,
      invocations: [],
      reason: `selected target is not dispatchable: ${selected.targetId}`,
    };
  }
  const baseInvocation = dispatchCandidate.invocation;

  const instruction = decision.selectedInstruction ?? selected.instruction;
  const invocation: CollaborationAgentInvocation = {
    ...baseInvocation,
    id: `${dispatchCandidate.targetId}-round-${round + 1}`,
    outputKey: `worker:${dispatchCandidate.targetId}:round:${round + 1}`,
    userMessage: instruction ?? baseInvocation.userMessage,
    metadata: {
      ...(baseInvocation.metadata ?? {}),
      supervisorRound: round + 1,
      supervisorReason: decision.reason ?? selected.reason ?? null,
      supervisorScore: selected.score,
      selectedTargetId: selected.targetId,
      selectedDispatchTargetId: dispatchCandidate.targetId,
    },
  };

  return {
    route: "dispatch",
    decision,
    selected,
    invocations: [invocation],
  };
};

const routeSelection = (input: unknown) => {
  const route = isRecord(input) && input.route === "dispatch" ? "dispatch" : "end";
  return {
    route,
    output: {
      route,
      selection: input,
    },
  };
};

const routeSupervisorLoop = (input: unknown) => {
  const record = isRecord(input) ? input : {};
  const round = normalizeRound(record.round);
  const maxRounds = Math.max(1, Math.floor(numberValue(record.maxRounds, 1)));
  const route = round < maxRounds ? "supervisor" : "end";
  return {
    route,
    output: {
      route,
      round,
      maxRounds,
    },
  };
};

const normalizeReviewDecision = (input: unknown): ReviewDecision => {
  const record = isRecord(input) ? input : {};
  const raw =
    typeof record.raw === "string"
      ? record.raw
      : typeof record.text === "string"
        ? record.text
        : typeof input === "string"
          ? input
          : "";
  const parsed = raw.trim() ? parseJsonObjectFromText(raw) : record;
  const status = stringValue(parsed.status);
  const normalizedStatus =
    status === "approved" || status === "complete" || status === "passed"
      ? "approved"
      : status === "blocked"
        ? "blocked"
        : "revise";

  return {
    status: normalizedStatus,
    score: typeof parsed.score === "number" ? parsed.score : null,
    reason: stringValue(parsed.reason),
    revisionInstruction:
      stringValue(parsed.revisionInstruction) ?? stringValue(parsed.instruction) ?? stringValue(parsed.feedback),
  };
};

const routeReview = (input: unknown) => {
  const decision = normalizeReviewDecision(input);
  const route = decision.status === "revise" ? "rewrite" : "end";
  return {
    route,
    output: {
      route,
      review: decision,
    },
  };
};

const routeReviewLoop = (input: unknown) => {
  const record = isRecord(input) ? input : {};
  const round = normalizeRound(record.round);
  const maxRounds = Math.max(1, Math.floor(numberValue(record.maxRounds, 1)));
  const review = normalizeReviewDecision(record.review);
  const route = review.status === "revise" && round < maxRounds ? "producer" : "end";
  return {
    route,
    output: {
      route,
      round,
      maxRounds,
      review,
    },
  };
};

export const createBuiltinCollaborationModeHandlers = (): CollaborationHandlerBundle => ({
  namespace: "builtin-mode",
  transforms: {
    "mode.incrementRound": (input) => normalizeRound(input) + 1,
    "supervisor.dispatch-loop.normalizeDecision": normalizeSupervisorDecision,
    "supervisor.dispatch-loop.selectDispatch": selectSupervisorDispatch,
    "producer.review-rewrite-loop.normalizeReview": normalizeReviewDecision,
  },
  routers: {
    "supervisor.dispatch-loop.routeSelection": routeSelection,
    "supervisor.dispatch-loop.routeLoop": routeSupervisorLoop,
    "producer.review-rewrite-loop.routeReview": routeReview,
    "producer.review-rewrite-loop.routeLoop": routeReviewLoop,
  },
});

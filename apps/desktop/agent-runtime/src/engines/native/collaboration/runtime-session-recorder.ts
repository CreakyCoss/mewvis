import type {
  CollaborationEvent,
  CollaborationRunInput,
  CollaborationStepResult,
} from "../../protocol/index.js";
import { CollaborationEventType } from "../../protocol/index.js";
import type {
  EmitCollaborationEvent,
} from "./contracts/handler.js";
import { createRuntimeSessionManager } from "../session/index.js";

type SessionBackedCollaborationInput = CollaborationRunInput & {
  sessionRootDir: string;
};

type CollaborationTimelineRecord = {
  type: "collaboration_event";
  workflowRunId: string;
  workflowId: string;
  modeId?: string | null;
  event: CollaborationEvent;
};

const hasSession = (
  input: CollaborationRunInput,
): input is SessionBackedCollaborationInput =>
  typeof input.workspacePath === "string" &&
  Boolean(input.workspacePath.trim()) &&
  typeof input.sessionRootDir === "string" &&
  Boolean(input.sessionRootDir.trim());

const modeIdFrom = (input: CollaborationRunInput) => {
  const metadataModeId = input.workflow.metadata?.modeId;
  return typeof metadataModeId === "string" && metadataModeId.trim()
    ? metadataModeId.trim()
    : null;
};

const summarizeStep = (step: CollaborationStepResult) => ({
  stepId: step.stepId,
  stepType: step.stepType,
  outputKey: step.outputKey,
  agentRoleId: step.agentRoleId ?? null,
  agentTaskId: step.agentTaskId ?? null,
  route: step.route ?? null,
  textPreview: step.text.slice(0, 1000),
});

const outputKeysFrom = (output: unknown) =>
  output && typeof output === "object" && !Array.isArray(output)
    ? Object.keys(output as Record<string, unknown>).sort()
    : [];

export class CollaborationSessionRecorder {
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly input: {
      collaboration: SessionBackedCollaborationInput;
      session: ReturnType<typeof createRuntimeSessionManager>;
      modeId: string | null;
    },
  ) {}

  static async create(
    input: CollaborationRunInput,
  ): Promise<CollaborationSessionRecorder | null> {
    if (!hasSession(input)) {
      return null;
    }

    const session = createRuntimeSessionManager(input);
    await session.refreshSession();

    return new CollaborationSessionRecorder({
      collaboration: input,
      session,
      modeId: modeIdFrom(input),
    });
  }

  wrapEmit(baseEmit: EmitCollaborationEvent): EmitCollaborationEvent {
    return (event) => {
      this.pendingWrite = this.pendingWrite
        .then(() => this.captureEvent(event))
        .catch((error: unknown) => {
          console.warn(`collaboration session recorder 写入失败：${String(error)}`);
        });
      baseEmit(event);
    };
  }

  async flush() {
    await this.pendingWrite;
    await this.refreshSession();
  }

  private async captureEvent(event: CollaborationEvent) {
    await this.input.session.appendTraceRecord({
      record: {
        type: "collaboration_event",
        workflowRunId: event.workflowRunId,
        workflowId: this.input.collaboration.workflow.id,
        modeId: this.input.modeId,
        event,
      } satisfies CollaborationTimelineRecord,
    });
    await this.appendLedgerEvent(event);
  }

  private async refreshSession() {
    try {
      await this.input.session.refreshSession();
    } catch (error: unknown) {
      console.warn(`collaboration session manifest 刷新失败：${String(error)}`);
    }
  }

  private async appendLedgerEvent(event: CollaborationEvent) {
    if (event.type === CollaborationEventType.AgentEvent) {
      return;
    }

    const common = {
      runtimeSessionMetadataVersion: 1,
      source: "collaboration",
      workflowRunId: event.workflowRunId,
      workflowId: this.input.collaboration.workflow.id,
      modeId: this.input.modeId,
    };

    if (event.type === CollaborationEventType.WorkflowStarted) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_run_started",
        data: {
          ...common,
          executorId: event.executorId,
        },
      });
      return;
    }

    if (event.type === CollaborationEventType.StepStarted) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_step_started",
        data: {
          ...common,
          stepId: event.stepId,
          stepType: event.stepType,
          agentRoleId: event.agentRoleId ?? null,
          agentTaskId: event.agentTaskId ?? null,
        },
      });
      return;
    }

    if (event.type === CollaborationEventType.StepDone) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_step_done",
        data: {
          ...common,
          step: summarizeStep(event.step),
        },
      });
      return;
    }

    if (event.type === CollaborationEventType.StepSkipped) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_step_skipped",
        data: {
          ...common,
          step: event.step,
        },
      });
      return;
    }

    if (event.type === CollaborationEventType.WorkflowDone) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_run_done",
        data: {
          ...common,
          executorId: event.result.executorId ?? null,
          stepCount: event.result.steps.length,
          skippedStepCount: event.result.skippedSteps?.length ?? 0,
          outputKeys: outputKeysFrom(event.result.output),
        },
      });
      return;
    }

    if (event.type === CollaborationEventType.Error) {
      await this.input.session.recordSessionEvent({
        eventType: "collaboration_run_error",
        data: {
          ...common,
          stepId: event.stepId ?? null,
          agentRoleId: event.agentRoleId ?? null,
          agentTaskId: event.agentTaskId ?? null,
          message: event.message,
        },
      });
    }
  }
}

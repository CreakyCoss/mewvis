import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CodingAgentAdapter,
  CodingAgentEvent,
  CodingAgentTask,
  CodingAgentTaskInput,
} from "../base";

type StartCodingAgentTaskOutput = {
  taskId: string;
};

export class PiRpcCodingAgentAdapter implements CodingAgentAdapter {
  readonly id = "pi-rpc";
  readonly name = "Pi Coding Agent";

  async startTask(input: CodingAgentTaskInput): Promise<CodingAgentTask> {
    const result = await invoke<StartCodingAgentTaskOutput>("start_coding_agent_task", {
      input,
    });

    return {
      taskId: result.taskId,
    };
  }

  async abortTask(taskId: string): Promise<void> {
    await invoke("abort_coding_agent_task", { taskId });
  }

  async answerQuestion(taskId: string, questionId: string, answer: string): Promise<void> {
    await invoke("answer_coding_agent_question", {
      input: { taskId, questionId, answer },
    });
  }

  async subscribe(listener: (event: CodingAgentEvent) => void) {
    return listen<CodingAgentEvent>("coding_agent_event", (event) => {
      listener(event.payload);
    });
  }
}

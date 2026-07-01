import {
  createRuntimeEngine,
} from "../engines/index.js";
import {
  AgentEventType,
  type AgentRuntimeCommand,
} from "../engines/protocol/index.js";
import {
  createStdioRuntimeReader,
  parseAgentRuntimeCommand,
  writeAgentEvent,
  writeJsonLine,
} from "./stdio.js";

const cliErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const runAgentRuntimeCli = async () => {
  const reader = createStdioRuntimeReader();
  const runtime = createRuntimeEngine({
    profileId: process.env.AGENT_RUNTIME_PROFILE_ID,
    close: () => {
      reader.close();
    },
    callbacks: {
      onEvent: writeAgentEvent,
      onResult: writeJsonLine,
    },
  });

  try {
    for await (const line of reader) {
      let command: AgentRuntimeCommand;
      try {
        command = parseAgentRuntimeCommand(line);
      } catch (error: unknown) {
        const message = cliErrorMessage(error);
        writeAgentEvent({
          type: AgentEventType.Error,
          message,
        });
        continue;
      }

      const keepRunning = await runtime.handle(command);
      if (!keepRunning) {
        break;
      }
    }
  } finally {
    await runtime.waitForRunningTask();
  }
};

runAgentRuntimeCli().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  writeAgentEvent({
    type: AgentEventType.Error,
    message,
  });
  process.exitCode = 1;
});

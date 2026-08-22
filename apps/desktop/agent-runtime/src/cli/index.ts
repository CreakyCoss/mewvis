import { createRuntimeEngine } from "../engines/index.js";
import type { AgentRuntimeCommand } from "../engines/protocol/index.js";
import { AgentRuntimeStdioProtocol, createStdioRuntimeReader } from "./stdio.js";

const runAgentRuntimeCli = async () => {
  const reader = createStdioRuntimeReader();
  const protocol = new AgentRuntimeStdioProtocol();
  const runtime = createRuntimeEngine({
    profileId: process.env.AGENT_RUNTIME_PROFILE_ID,
    close: () => {
      reader.close();
    },
    callbacks: {
      onEvent: (event) => protocol.writeEvent(event),
      onResult: (result) => protocol.writeResult(result),
    },
  });

  try {
    for await (const line of reader) {
      let command: AgentRuntimeCommand;
      try {
        command = protocol.parseCommand(line);
      } catch (error: unknown) {
        protocol.writeError(error);
        continue;
      }

      protocol.beginCommand(command);
      let keepRunning: boolean;
      try {
        keepRunning = await runtime.handle(command);
      } catch (error: unknown) {
        protocol.writeError(error);
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        console.error(message);
        keepRunning = true;
      } finally {
        protocol.endCommand(command);
      }
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
  process.exitCode = 1;
});

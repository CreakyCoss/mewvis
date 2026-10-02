import { createRuntimeEngine } from "../engines/index.js";
import type { AgentRuntimeCommand } from "../engines/protocol/index.js";
import { AgentRuntimeStdioProtocol, createStdioRuntimeReader } from "./stdio.js";

const runAgentRuntimeCli = async () => {
  const reader = createStdioRuntimeReader();
  const protocol = new AgentRuntimeStdioProtocol();
  const runtime = createRuntimeEngine({
    profileId: process.env.AGENT_RUNTIME_PROFILE_ID,
    extensionSettingsPath: process.env.MEWVIS_EXTENSION_SETTINGS_PATH,
    bundledExtensionsPath: process.env.MEWVIS_BUNDLED_EXTENSIONS_PATH,
    reloadExtensionSettings: true,
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
    try {
      await runtime.waitForRunningTask();
    } finally {
      // EOF is also a normal shutdown path for one-shot desktop RPCs.
      await runtime.shutdown();
    }
  }
};

runAgentRuntimeCli().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});

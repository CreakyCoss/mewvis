import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import {
  PI_SUBAGENT_ROLES,
  limitSubagentText,
  subagentAllowedTools,
  type PiSubagentRunner,
} from "../tools/subagent.js";
import type { PiSandboxConfig } from "../tools/sandbox.js";
import { withIdleTimeout } from "./idle-timeout.js";

export const createPiSubagentRunner =
  (
    command: RuntimeAgentCommand,
    callbacks: AgentRuntimeCallbacks,
    parentTools: readonly string[],
    sandboxConfig: PiSandboxConfig,
  ): PiSubagentRunner =>
  async (task, signal, onProgress) => {
    signal?.throwIfAborted();
    const { createPiAgentSession } = await import("./session.js");
    const created = await createPiAgentSession(
      {
        ...command,
        // Do not continue or mutate the parent's transcript or native session link.
        agentSessionDir: null,
        sessionLink: null,
        nativeSessionContextRef: null,
        sessionBootstrapContext: null,
      },
      callbacks,
      {
        subagent: true,
        toolCeiling: subagentAllowedTools(parentTools, task.agent),
        rolePrompt: `${PI_SUBAGENT_ROLES[task.agent].prompt}\nYou are a delegated agent. You only know the supplied task, workspace instructions and enabled skills. Return blockers to the parent agent.`,
        sandboxConfig,
      },
    );
    const { session } = created;
    let text = "";
    let failure: string | undefined;
    let turns = 0;
    const abort = () => {
      void session.abort().catch(() => undefined);
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        text = limitSubagentText(text + event.assistantMessageEvent.delta);
        onProgress(`${task.agent}: ${text.slice(-2000)}`);
      } else if (event.type === "message_start" && event.message.role === "assistant") {
        text = "";
      } else if (event.type === "message_end" && event.message.role === "assistant") {
        const message = event.message;
        text = limitSubagentText(
          message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
        );
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          failure = message.errorMessage ?? `Subagent ${message.stopReason}`;
        } else failure = undefined;
      } else if (
        event.type === "turn_end" &&
        ++turns >= 32 &&
        event.message.role === "assistant" &&
        event.message.stopReason === "toolUse"
      ) {
        failure = "Subagent exceeded its 32-turn limit.";
        abort();
      }
      // Keep the parent's tool stream active during reasoning, retries and tool use.
      if (event.type !== "message_update") onProgress(`${task.agent}: ${event.type}`);
      else if (event.assistantMessageEvent.type !== "text_delta")
        onProgress(`${task.agent}: ${event.assistantMessageEvent.type}`);
    });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      await withIdleTimeout(() => session.prompt(task.task), {
        timeoutMs: 4 * 60_000,
        message: "Subagent had no activity for four minutes.",
        subscribe: (onActivity) => session.subscribe(onActivity),
        onTimeout: async () => {
          await session.abort();
        },
      });
      signal?.throwIfAborted();
      const stats = session.getSessionStats();
      return {
        agent: task.agent,
        text: failure ?? text,
        isError: Boolean(failure),
        usage: { input: stats.tokens.input, output: stats.tokens.output, total: stats.tokens.total, cost: stats.cost },
      };
    } finally {
      signal?.removeEventListener("abort", abort);
      unsubscribe();
      try {
        await session.abort();
      } finally {
        session.dispose();
        await created.disposeResources();
      }
    }
  };

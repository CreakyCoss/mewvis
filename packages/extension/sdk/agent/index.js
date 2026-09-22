/** Authoring helper. The worker validates the contract before activation. */
export const defineExtension = (extension) => extension;
export const extensionCapabilities = Object.freeze([
  "tools",
  "skills",
  "commands",
  "session.state",
  "events.run",
  "events.tool",
  "events.turn",
  "events.message",
  "events.session",
  "middleware.input",
  "middleware.system_prompt",
  "middleware.context",
  "middleware.tool_call",
  "middleware.tool_result",
  "middleware.session_compact",
]);

export const extensionEventCapabilities = Object.freeze({
  run_started: "events.run",
  run_finished: "events.run",
  tool_started: "events.tool",
  tool_finished: "events.tool",
  turn_started: "events.turn",
  turn_finished: "events.turn",
  message_started: "events.message",
  message_updated: "events.message",
  message_finished: "events.message",
  session_compact_finished: "events.session",
});

export function extensionToolName(extensionId, toolName) {
  return `ext_${extensionId.replace(/[.-]/g, "_")}__${toolName}`;
}

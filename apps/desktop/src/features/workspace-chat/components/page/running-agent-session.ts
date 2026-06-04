export const getRunningAgentSessionKey = (workspacePath: string, sessionId: string) =>
  `${workspacePath}\u0000${sessionId}`;

export const workspaceFields = {
  workspaceId: { type: "string", minLength: 1 },
} as const;
export const workspaceRequired = ["workspaceId"];
export const output = {
  schema: { type: "object" },
  render: (_args: unknown, value: unknown) => [
    { type: "text" as const, text: JSON.stringify(value, null, 2) },
  ],
};
export type WorkspaceArgs = { workspaceId: string; workspacePath: string };

/** The host entry resolves the ID and injects this path after validating public tool arguments. */
export const projectPath = (input: WorkspaceArgs) => input.workspacePath;

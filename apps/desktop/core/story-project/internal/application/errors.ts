import { ZodError } from "zod";
import { StoryProjectRevisionConflictError } from "../../storage/index.js";
import type { StoryValidationIssue } from "../../types.js";
import { StoryProjectValidationError } from "../engine/issues.js";

const zodPath = (owner: string, path: PropertyKey[]) =>
  path.reduce<string>(
    (result, segment) =>
      typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${String(segment)}` : String(segment),
    owner,
  );

export const errorIssues = (
  error: unknown,
  owner = "changeSet",
  code = "changeset.invalid",
): StoryValidationIssue[] => {
  if (error instanceof StoryProjectValidationError) return [...error.issues];
  if (error instanceof StoryProjectRevisionConflictError) {
    return [{ severity: "error", code: "store.revision_conflict", path: error.key, message: error.message }];
  }
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      severity: "error",
      code: `${code}.${issue.code}`,
      path: zodPath(owner, issue.path),
      message: issue.message,
    }));
  }
  return [
    {
      severity: "error",
      code,
      path: owner,
      message: error instanceof Error ? error.message : String(error),
    },
  ];
};

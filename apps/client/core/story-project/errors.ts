import type { StoryValidationIssue } from "./types.js";

export const storyValidationIssue = (code: string, path: string, message: string): StoryValidationIssue => ({
  severity: "error",
  code,
  path,
  message,
});

/** Story Project 结构或业务规则校验失败。 */
export class StoryProjectValidationError extends Error {
  constructor(readonly issues: StoryValidationIssue[]) {
    super(issues.map((item) => `${item.path}：${item.message}`).join("\n"));
    this.name = "StoryProjectValidationError";
  }
}

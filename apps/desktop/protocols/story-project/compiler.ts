import type { StoryProjectApi } from "./protocol.js";

export type StoryProjectCompilerSource = Readonly<{
  profile: unknown;
  layout: unknown;
}>;

export interface StoryProjectCompiler {
  readonly format: string;
  readonly compilerVersion: number;
  compile(source: StoryProjectCompilerSource): StoryProjectApi;
}

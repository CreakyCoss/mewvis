import type { StoryProjectApi } from "./protocol.js";

export interface StoryContractCompiler {
  readonly format: string;
  readonly compilerVersion: number;
  compile(source: unknown): StoryProjectApi;
}

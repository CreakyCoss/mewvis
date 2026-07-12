import { assertProtocolImplementation } from "../definition.js";
import type { StoryContractCompiler } from "./compiler.js";
import { STORY_PROJECT_PROTOCOL, type StoryProjectApi } from "./protocol.js";
import { STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER } from "./formats/structured-novel-v1/compiler.js";

const contractFormat = (source: unknown) => {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("故事协议必须是普通 JSON 对象。");
  }
  const format = (source as { $format?: unknown }).$format;
  if (typeof format !== "string" || !format.trim()) throw new Error("故事协议缺少 $format。");
  return format;
};

export class StoryContractCompilerRegistry {
  readonly #compilers = new Map<string, StoryContractCompiler>();

  constructor(compilers: readonly StoryContractCompiler[] = []) {
    for (const compiler of compilers) this.register(compiler);
  }

  register(compiler: StoryContractCompiler) {
    if (this.#compilers.has(compiler.format)) {
      throw new Error(`故事协议 Compiler 重复注册：${compiler.format}`);
    }
    this.#compilers.set(compiler.format, compiler);
    return this;
  }

  resolve(format: string) {
    const compiler = this.#compilers.get(format);
    if (!compiler) throw new Error(`没有受信任的 StoryContractCompiler 可以处理：${format}`);
    return compiler;
  }

  compile(source: unknown): StoryProjectApi {
    const project = this.resolve(contractFormat(source)).compile(source);
    assertProtocolImplementation(STORY_PROJECT_PROTOCOL, project);
    return project;
  }
}

export const createStoryContractCompilerRegistry = () =>
  new StoryContractCompilerRegistry([STRUCTURED_NOVEL_STORY_CONTRACT_COMPILER]);

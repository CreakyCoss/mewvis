import { assertProtocolImplementation } from "../definition.js";
import type { StoryProjectCompiler } from "./compiler.js";
import { STORY_PROJECT_PROTOCOL, type StoryProjectApi } from "./protocol.js";
import { DECLARATIVE_STORY_PROJECT_COMPILER } from "./runtime.js";

export class StoryProjectCompilerRegistry {
  readonly #compilers = new Map<string, StoryProjectCompiler>();

  constructor(compilers: readonly StoryProjectCompiler[] = []) {
    for (const compiler of compilers) this.register(compiler);
  }

  register(compiler: StoryProjectCompiler) {
    if (this.#compilers.has(compiler.format)) {
      throw new Error(`故事协议 Compiler 重复注册：${compiler.format}`);
    }
    this.#compilers.set(compiler.format, compiler);
    return this;
  }

  resolve(format: string) {
    const compiler = this.#compilers.get(format);
    if (!compiler) throw new Error(`没有受信任的 StoryProjectCompiler 可以处理：${format}`);
    return compiler;
  }

  compile(format: string, source: Parameters<StoryProjectCompiler["compile"]>[0]): StoryProjectApi {
    const project = this.resolve(format).compile(source);
    assertProtocolImplementation(STORY_PROJECT_PROTOCOL, project);
    return project;
  }
}

export const createStoryProjectCompilerRegistry = () =>
  new StoryProjectCompilerRegistry([DECLARATIVE_STORY_PROJECT_COMPILER]);

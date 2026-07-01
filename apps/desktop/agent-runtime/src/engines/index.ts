import { createNativeRuntimeEngine } from "./drivers/native/index.js";
import type { RuntimeEngineOptions } from "./runtime.js";

export const createRuntimeEngine = (options: RuntimeEngineOptions = {}) =>
  createNativeRuntimeEngine(options);

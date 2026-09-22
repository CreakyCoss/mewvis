/** Public SDK facade; protocol composition is defined in index.d.ts. */
export * from "./agent/index.js";
export * from "./ui/index.js";
export {
  defineExtensionAdapter,
  resolveExtensionAdaptation,
} from "./host/adapter.js";

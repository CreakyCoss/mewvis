import { isJsonValue } from "@earendil-works/chord";
import { extensionCapabilities, type ExtensionSource, type JsonValue } from "@isle/extension-sdk";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";

const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
    entry: z.string().refine(isAbsolute, "插件入口必须为绝对路径"),
    toolRisks: z.record(z.string(), z.enum(["low", "medium", "high"])).optional(),
    commandRisks: z.record(z.string(), z.enum(["low", "medium", "high"])).optional(),
    config: z.record(z.string(), z.custom<JsonValue>(isJsonValue, "插件配置必须为 JSON")).optional(),
    capabilities: z.array(z.enum(extensionCapabilities)).optional(),
  })
  .strict();

export function snapshotExtensionSources(sources: readonly ExtensionSource[]): readonly ExtensionSource[] {
  const ids = new Set<string>();
  return Object.freeze(
    sources.map((value) => {
      const source = sourceSchema.parse(value);
      if (ids.has(source.id)) throw new Error(`重复插件：${source.id}`);
      ids.add(source.id);
      const entry = realpathSync(source.entry);
      if (!/\.m?js$/.test(entry) || !statSync(entry).isFile()) throw new Error("插件入口必须为已构建的 .js/.mjs 文件");
      return Object.freeze({
        ...source,
        config: source.config && structuredClone(source.config),
        capabilities: source.capabilities && Object.freeze([...source.capabilities]),
        entry,
        toolRisks: source.toolRisks && Object.freeze({ ...source.toolRisks }),
        commandRisks: source.commandRisks && Object.freeze({ ...source.commandRisks }),
      });
    }),
  );
}

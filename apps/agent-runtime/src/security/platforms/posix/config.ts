import { z } from "zod";
import { resourcePaths, validateConfiguredPaths } from "../resources.js";

const schema = z.object({ systemWritePaths: resourcePaths, temporaryDirectory: z.string().min(1) }).strict();
export const resolvedConfigSchema = schema.extend({ kind: z.literal("posix") });
export type PosixSandboxConfig = z.infer<typeof resolvedConfigSchema>;

export function resolveSandboxConfig(input: unknown, path: (value: string) => string): PosixSandboxConfig {
  const config = schema.parse(input);
  validateConfiguredPaths([...config.systemWritePaths, config.temporaryDirectory]);
  return {
    kind: "posix",
    systemWritePaths: config.systemWritePaths.map(path),
    temporaryDirectory: config.temporaryDirectory,
  };
}

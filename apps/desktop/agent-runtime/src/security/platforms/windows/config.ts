import { z } from "zod";
import { resourcePaths, validateConfiguredPaths } from "../resources.js";

const schema = z
  .object({
    srtWinPath: z.string().min(1),
    proxyPortRange: z.tuple([z.number().int().min(1024).max(65535), z.number().int().min(1024).max(65535)]),
    readGrantPaths: resourcePaths,
    privateAccountProfile: z.literal(true),
    mandatorySearchDepth: z.number().int().min(0).max(10),
    policyStore: z.string().min(1),
  })
  .strict();
export const resolvedConfigSchema = schema.extend({
  kind: z.literal("windows"),
  temporaryDirectory: z.string().min(1),
});
export type WindowsSandboxConfig = z.infer<typeof resolvedConfigSchema>;

export function resolveSandboxConfig(input: unknown, path: (value: string) => string): WindowsSandboxConfig {
  const config = schema.parse(input);
  validateConfiguredPaths(
    [...config.readGrantPaths, config.srtWinPath, config.policyStore],
    ["workspace", "home", "temp", "runtime", "nodeDirectory", "programData", "arch"],
  );
  if (config.proxyPortRange[0] > config.proxyPortRange[1]) throw new Error("Windows 代理端口范围无效。");
  if (/\$\{(?!runtime\}|arch\})/.test(config.srtWinPath))
    throw new Error("沙箱程序位置只支持 runtime、arch 变量或绝对路径。");
  return {
    ...config,
    kind: "windows",
    srtWinPath: path(config.srtWinPath),
    policyStore: path(config.policyStore),
    readGrantPaths: config.readGrantPaths.map(path),
    temporaryDirectory: path("${temp}"),
  };
}

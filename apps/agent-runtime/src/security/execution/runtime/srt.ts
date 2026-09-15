import { z } from "zod";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import metadata from "@anthropic-ai/sandbox-runtime/package.json" with { type: "json" };
import { DANGEROUS_FILES, getDangerousDirectories } from "@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js";
import { getProcessPlatform, loadSandboxPlatform, loadSetupPlatform } from "../../platforms/index.js";
import { platformKey, resourcePaths } from "../../platforms/resources.js";
import { resolvedConfigSchema as posixConfig } from "../../platforms/posix/config.js";
import { resolvedConfigSchema as windowsConfig } from "../../platforms/windows/config.js";
import type { ResolvedExecutionBackend, SandboxPolicy, ExecutionProgram, SandboxReadiness } from "../types.js";

const optionsSchema = z
  .object({
    protectedFileNames: resourcePaths,
    protectedDirectories: resourcePaths,
    platform: z.discriminatedUnion("kind", [posixConfig, windowsConfig]),
  })
  .strict();
export type SrtOptions = z.infer<typeof optionsSchema>;
export type SrtBackend = Omit<ResolvedExecutionBackend, "options"> & { options: SrtOptions };
export type SrtSandboxPolicy = Omit<SandboxPolicy, "backend"> & { backend: SrtBackend };

function validateBackend(backend: ResolvedExecutionBackend): SrtBackend {
  if (backend.name !== "srt" || backend.version !== metadata.version)
    throw new Error(`配置的沙箱后端或版本与已安装 SRT ${metadata.version} 不一致。`);
  if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy"))
    throw new Error("当前 Node 运行时不支持环境代理，请更新应用随附的 Node 运行时。");
  const options = optionsSchema.parse(backend.options);
  if (options.platform.kind !== platformKey(process.platform)) throw new Error("沙箱快照与当前运行平台不匹配。");
  const equal = (a: readonly string[], b: readonly string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (
    !equal(options.protectedFileNames, DANGEROUS_FILES) ||
    !equal(options.protectedDirectories, [...getDangerousDirectories(), ".git/hooks", ".git/config"])
  )
    throw new Error("配置声明的沙箱基础限制与已安装 SRT 不一致，请更新配置后再执行。");
  return { ...backend, options };
}

export async function createSandbox(policy: SandboxPolicy) {
  const backend = validateBackend(policy.backend);
  const lifecycle = (await loadSandboxPlatform()).createSandbox({ ...policy, backend });
  const platform = getProcessPlatform();
  return {
    ...lifecycle,
    wrapProgram(program: ExecutionProgram, channelArgs: readonly string[]) {
      const command = platform.programCommand(
        program,
        channelArgs,
        lifecycle.temporaryDirectory ?? backend.options.platform.temporaryDirectory,
      );
      return SandboxManager.wrapWithSandboxArgv(command, platform.shell, undefined, undefined, policy.workspacePath);
    },
  };
}

export async function getReadiness(input: ResolvedExecutionBackend): Promise<SandboxReadiness> {
  const backend = validateBackend(input);
  return (await loadSetupPlatform()).getReadiness(backend.options.platform);
}
export async function install(input: ResolvedExecutionBackend): Promise<SandboxReadiness> {
  const backend = validateBackend(input);
  return (await loadSetupPlatform()).install(backend.options.platform);
}

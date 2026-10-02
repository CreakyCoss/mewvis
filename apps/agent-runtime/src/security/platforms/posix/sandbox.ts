import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { getDefaultWritePaths } from "@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js";
import type { SrtSandboxPolicy as SandboxPolicy, SrtOptions } from "../../execution/runtime/srt.js";
import { canonicalPath, networkAllowed } from "../resources.js";
import type { SandboxLifecycle, SandboxReadiness } from "../../execution/types.js";

function validateConfig(options: SrtOptions["platform"]) {
  if (options.kind !== "posix") throw new Error("缺少已解析的 POSIX 沙箱配置。");
  const canonical = (value: string) => (value.startsWith("/dev/") ? value : canonicalPath(value));
  const actual = getDefaultWritePaths().map(canonical).sort();
  if (
    options.temporaryDirectory !== "/tmp/claude" ||
    JSON.stringify([...options.systemWritePaths].sort()) !== JSON.stringify(actual)
  )
    throw new Error("配置声明的系统写入范围或临时目录与已安装 SRT 不一致。");
}

export function createSandbox(policy: SandboxPolicy): SandboxLifecycle {
  let scratch: string | undefined;
  return {
    get temporaryDirectory() {
      return scratch;
    },
    async initialize() {
      validateConfig(policy.backend.options.platform);
      mkdirSync(policy.backend.options.platform.temporaryDirectory, { recursive: true });
      const filesystem = structuredClone(policy.filesystem);
      if (filesystem.allowRead) {
        scratch = canonicalPath(mkdtempSync(join(policy.backend.options.platform.temporaryDirectory, "mewvis-")));
        filesystem.allowRead.push(scratch);
      }
      process.env.TMPDIR = scratch ?? policy.backend.options.platform.temporaryDirectory;
      await SandboxManager.initialize(
        {
          filesystem,
          network: {
            allowedDomains: policy.network.allow === "all" ? ["mewvis-proxy.invalid"] : policy.network.allow,
            deniedDomains: policy.network.deny,
          },
        },
        async ({ host }) => networkAllowed(policy, host),
        false,
      );
    },
    async reset() {
      await SandboxManager.reset();
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    },
  };
}

export async function getReadiness(options: SrtOptions["platform"]): Promise<SandboxReadiness> {
  validateConfig(options);
  const dependencies = SandboxManager.checkDependencies();
  return dependencies.errors.length
    ? { state: "unavailable", canInstall: false, message: dependencies.errors.join("\n") }
    : { state: "ready", canInstall: false, message: "沙箱依赖已就绪。" };
}

export async function install(options: SrtOptions["platform"]): Promise<SandboxReadiness> {
  return getReadiness(options);
}

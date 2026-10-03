import { productId } from "@mewvis/product-config";
import {
  SandboxManager,
  checkWindowsSandboxStatusAsync,
  resolveSrtWin,
  revokeWindowsAcl,
  restoreWindowsAcl,
} from "@anthropic-ai/sandbox-runtime";
import type { SrtSandboxPolicy as SandboxPolicy } from "../../execution/runtime/srt.js";
import { networkAllowed } from "../resources.js";
import type { SandboxLifecycle } from "../../execution/types.js";
import { windowsFilesystem } from "./policy.js";
import { acquirePolicyLease, policyFingerprint } from "./policy-lease.js";

export function createSandbox(policy: SandboxPolicy): SandboxLifecycle {
  let releaseLease: (() => void) | undefined;
  let cleanupAcl: (() => void) | undefined;
  return {
    async initialize() {
      const windows = policy.backend.options.platform;
      if (windows.kind !== "windows")
        throw new Error("缺少已解析的 Windows 沙箱配置。");
      const srtWin = resolveSrtWin({ path: windows.srtWinPath });
      const { user } = await checkWindowsSandboxStatusAsync({ srtWin });
      if (!user.provisioned || !user.credPresent || !user.sid)
        throw new Error(
          "Windows 沙箱尚未初始化，请打开应用设置 → Agent 沙箱，完成初始化后重试。",
        );
      const cleanup = (holderPid: number) => {
        const options = { sandboxUserSid: user.sid!, holderPid, srtWin };
        const results = [revokeWindowsAcl(options), restoreWindowsAcl(options)];
        const ok = new Set([
          "revoked",
          "stillHeld",
          "restored",
          "alreadyOriginal",
        ]);
        if (
          results.some(
            (result) =>
              !result || result.some((entry) => !ok.has(entry.status)),
          )
        )
          throw new Error(
            "Windows 沙箱文件权限清理失败，已保留占用记录。请修复 SRT ACL 状态后重试。",
          );
      };
      releaseLease = acquirePolicyLease(
        windows.policyStore,
        policyFingerprint(policy),
        cleanup,
      );
      cleanupAcl = () => cleanup(process.pid);
      try {
        await SandboxManager.initialize(
          {
            filesystem: windowsFilesystem(policy),
            network: {
              allowedDomains:
                policy.network.allow === "all"
                  ? [productId("-proxy.invalid")]
                  : policy.network.allow,
              deniedDomains: policy.network.deny,
            },
            windows: {
              srtWin: { path: windows.srtWinPath },
              proxyPortRange: windows.proxyPortRange,
            },
          },
          async ({ host }) => networkAllowed(policy, host),
          false,
        );
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\n如尚未初始化，请打开应用设置 → Agent 沙箱，完成初始化后重试。`,
        );
      }
    },
    async reset() {
      // Verify ACL cleanup before releasing a lease; SRT reset only logs anomalies.
      cleanupAcl?.();
      await SandboxManager.reset();
      releaseLease?.();
    },
  };
}

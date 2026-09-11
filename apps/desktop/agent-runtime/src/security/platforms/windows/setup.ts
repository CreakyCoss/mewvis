import { existsSync } from "node:fs";
import {
  checkWindowsSandboxStatusAsync,
  installWindowsSandboxAsync,
  resolveSrtWin,
  verifyWindowsWfpEgress,
} from "@anthropic-ai/sandbox-runtime";
import type { SrtOptions } from "../../execution/runtime/srt.js";
import type { SandboxReadiness } from "../../execution/types.js";

function sandboxOptions(config: SrtOptions["platform"]) {
  if (config.kind !== "windows") throw new Error("缺少已解析的 Windows 沙箱配置。");
  return { path: config.srtWinPath, proxyPortRange: config.proxyPortRange };
}

export async function getReadiness(config: SrtOptions["platform"]): Promise<SandboxReadiness> {
  const options = sandboxOptions(config);
  if (!existsSync(options.path))
    return { state: "unavailable", canInstall: false, message: "缺少 Windows 沙箱启动程序，请重新安装应用。" };
  try {
    const srtWin = resolveSrtWin({ path: options.path });
    const { user } = await checkWindowsSandboxStatusAsync({ srtWin });
    if (!user.provisioned || !user.credPresent || !user.groupExists || !user.inSandboxGroup)
      return {
        state: "setup-required",
        canInstall: true,
        message: "首次使用需要初始化 Windows 沙箱。系统会请求一次管理员确认，用于创建隔离账户和网络规则。",
      };
    await verifyWindowsWfpEgress({ srtWin, proxyPortRange: options.proxyPortRange });
    return { state: "ready", canInstall: false, message: "Windows 沙箱账户和网络隔离已就绪。" };
  } catch (error) {
    return {
      state: "setup-required",
      canInstall: true,
      message: `Windows 沙箱需要初始化或修复：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function install(config: SrtOptions["platform"]): Promise<SandboxReadiness> {
  const current = await getReadiness(config);
  if (!current.canInstall) return current;
  const options = sandboxOptions(config);
  const result = await installWindowsSandboxAsync({
    srtWin: resolveSrtWin({ path: options.path }),
    proxyPortRange: options.proxyPortRange,
  });
  if (result.cancelled) return { ...current, message: "已取消沙箱初始化，工具执行仍不可用。" };
  return getReadiness(config);
}

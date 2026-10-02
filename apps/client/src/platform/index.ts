import { platform as implementation } from "@platform-impl";
import type { ClientPlatform } from "@mewvis/client-platform";

/** The build selects the implementation; shared pages consume capabilities. */
export const platform: ClientPlatform = {
  ...implementation,
  async openExternal(url) {
    const parsed = new URL(url);
    if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) throw new Error("不支持此链接类型");
    await implementation.openExternal(parsed.href);
  },
};

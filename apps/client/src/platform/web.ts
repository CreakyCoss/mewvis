import type { ClientPlatform } from "@isle/client-platform";

export const platform: ClientPlatform = {
  kind: "web",
  getBackendConnection: async () => undefined,
  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

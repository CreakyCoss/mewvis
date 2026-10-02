import type { ClientPlatform } from "@mewvis/client-platform";

export const platform: ClientPlatform = {
  kind: "web",
  getBackendConnection: async () => undefined,
  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

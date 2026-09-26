import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { BackendConnection, ClientPlatform } from "@isle/client-platform";

let connection: Promise<BackendConnection> | undefined;

async function getBackendConnection() {
  connection ??= invoke<BackendConnection>("get_backend_connection")
    .then((value) => {
      const url = new URL(value.url);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        !url.port ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !/^[a-f0-9]{64}$/i.test(value.token)
      )
        throw new Error("Invalid desktop backend connection");
      return { url: url.origin, token: value.token };
    })
    .catch((error) => {
      connection = undefined;
      throw error;
    });
  return connection;
}

export const platform: ClientPlatform = {
  kind: "desktop",
  getBackendConnection,
  openExternal: (url) => openUrl(url),
  openDialog: (options) => open(options),
  async revealPath(path) {
    await revealItemInDir(path);
  },
  window: {
    startDragging: () => getCurrentWindow().startDragging(),
    async onCloseRequested(canClose, onError) {
      const window = getCurrentWindow();
      let active = true;
      let closing = false;
      const unlisten = await window.onCloseRequested(async (event) => {
        if (!active) return;
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          if ((await canClose()) && active) await window.destroy();
        } catch (error) {
          onError(error);
        } finally {
          closing = false;
        }
      });
      return () => {
        active = false;
        unlisten();
      };
    },
  },
};

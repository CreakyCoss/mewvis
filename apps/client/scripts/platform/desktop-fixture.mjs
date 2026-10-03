import { fileURLToPath } from "node:url";

const adapter = fileURLToPath(new URL("../../../desktop/src/platform/tauri.ts", import.meta.url));

/** Bundle the real desktop adapter while replacing only its OS bridge. */
export function desktopPlatformFixture(globalName = "__platformFixture", titleBarStyle = "native") {
  const fixture = `globalThis[${JSON.stringify(globalName)}]`;
  return {
    name: "desktop-platform-fixture",
    setup(build) {
      build.initialOptions.define = {
        ...build.initialOptions.define,
        __APP_TITLE_BAR_STYLE__: JSON.stringify(titleBarStyle),
      };
      build.onResolve({ filter: /^@platform-impl$/ }, () => ({ path: adapter }));
      build.onResolve({ filter: /^@tauri-apps\/(api\/(core|window)|plugin-(dialog|opener))$/ }, ({ path }) => ({
        path,
        namespace: "native-fixture",
      }));
      build.onLoad({ filter: /.*/, namespace: "native-fixture" }, ({ path }) => ({
        contents: path.endsWith("/core")
          ? `export const invoke = (...args) => ${fixture}.invoke(...args);`
          : path.endsWith("/window")
            ? `export const getCurrentWindow = () => ${fixture}.window;`
            : path.endsWith("plugin-dialog")
              ? `export const open = (...args) => ${fixture}.openDialog(...args);`
              : `export const openUrl = (...args) => ${fixture}.openExternal(...args); export const revealItemInDir = (...args) => ${fixture}.revealPath(...args);`,
      }));
    },
  };
}

import {
  getSandboxStatus,
  installSandbox,
  setSandboxEnabled,
} from "../index.js";
import entries from "../../../../build-entries.json" with { type: "json" };

const action = process.argv[2];
if (
  action !== "status" &&
  action !== "install" &&
  action !== "enable" &&
  action !== "disable"
) {
  console.error(
    `用法：node ${entries.sandboxControl.output} <status|install|enable|disable>`,
  );
  process.exitCode = 1;
} else {
  try {
    const status = await (action === "enable" || action === "disable"
      ? setSandboxEnabled(action === "enable")
      : action === "install"
        ? installSandbox()
        : getSandboxStatus());
    process.stdout.write(`${JSON.stringify(status)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

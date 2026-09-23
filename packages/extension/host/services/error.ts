import type { ExtensionHostErrorCode } from "./contracts.js";
/** Native plugin error. The application maps status/code into its transport. */
export class PluginError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PluginError";
  }
}
export class HostServiceError extends PluginError {
  constructor(status: number, code: ExtensionHostErrorCode, message: string) {
    super(status, code, message);
    this.name = "HostServiceError";
  }
}

import type { JsonObject } from "../shared.js";
import type { ExtensionHostServices } from "../host/services.js";

/** Browser entry contract; portable slot declarations do not depend on the DOM. */
export interface ExtensionUIContext {
  readonly host: ExtensionHostServices;
  readonly contributionId: string;
  readonly viewId: string;
  readonly config: Readonly<JsonObject>;
  readonly signal: AbortSignal;
}

export interface ExtensionUIDefinition {
  id: string;
  apiVersion: 1;
  mount(
    root: HTMLElement,
    context: ExtensionUIContext,
  ): void | (() => void) | Promise<void | (() => void)>;
}

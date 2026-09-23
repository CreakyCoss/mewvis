import type { JsonObject } from "../../shared.js";
import type { ExtensionHostServices } from "../../services/contracts.js";

/** Browser entry contract; portable slot declarations do not depend on the DOM. */
export interface ExtensionUIContext {
  readonly services: ExtensionHostServices;
  /** Serializable parameters supplied by the opening view. Empty for a sidebar. */
  readonly input: Readonly<JsonObject>;
  readonly ui: {
    readonly dialog: {
      readonly available: boolean;
      /** Opens this plugin's declared dialog contribution. Resolves when it closes. */
      open(request: { id: string; input?: JsonObject }): Promise<void>;
      /** Closes the current dialog; does nothing in a sidebar. */
      close(): void;
    };
  };
  readonly contributionId: string;
  readonly viewId: string;
  readonly config: Readonly<JsonObject>;
  readonly signal: AbortSignal;
}

export interface ExtensionUIDefinition {
  id: string;
  protocolVersion: 1;
  mount(
    root: HTMLElement,
    context: ExtensionUIContext,
  ): void | (() => void) | Promise<void | (() => void)>;
}

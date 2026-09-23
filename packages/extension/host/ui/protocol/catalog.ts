import type { ExtensionUIContribution } from "./transport";

/** The application supplies discovery and invalidation; the host owns catalog state. */
export interface ExtensionUICatalogSource {
  list(): Promise<readonly ExtensionUIContribution[]>;
  subscribe(changed: () => void): (() => void) | Promise<() => void>;
}

export interface ExtensionUICatalogState {
  contributions: readonly ExtensionUIContribution[];
  error: string;
}

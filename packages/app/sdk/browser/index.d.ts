export interface ApplicationHostInfo {
  application: { id: string; name: string; version: string };
  theme: "light" | "dark";
  /** Resolved design-system CSS tokens, also applied to the sandbox root by the host. */
  themeTokens?: Readonly<Record<string, string>>;
  tools: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }[];
}
export interface ApplicationToolResult<T = unknown> {
  value: T;
  content: unknown[];
  meta: unknown;
}
export interface ApplicationHeaderState {
  /** Plain-text title, up to 160 characters. */
  title: string;
  /** Optional back action label, up to 80 characters. */
  backLabel?: string;
  backDisabled?: boolean;
}
export interface ApplicationHeaderHost {
  /** Uses the host's existing top bar. Null releases this frame's header. */
  set(header: ApplicationHeaderState | null): Promise<{ supported: boolean }>;
  subscribe(listener: (action: "back") => void): () => void;
}
export interface ApplicationBrowserHost {
  readonly version: 1;
  /** Optional host-rendered title and back action. Older and preview hosts omit it. */
  readonly header?: ApplicationHeaderHost;
  /** Optional authenticated data v1 transport. Older hosts omit this capability. */
  readonly data?: import("../data/index.js").ApplicationDataTransport;
  /** Present only when the application declares embedded-views. Children receive no application bridge. */
  readonly views?: import("../views/index.js").ApplicationViewHost;
  /** Only this application's tools enabled by the user can be invoked. Result types are caller supplied. */
  executeTool<T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<ApplicationToolResult<T>>;
  getHost(): ApplicationHostInfo | null;
  writeClipboardText?(text: string): Promise<void>;
  openExternal(url: string): Promise<{ opened: boolean }>;
}
export declare function getApplicationHost(): ApplicationBrowserHost;

/** Copies from a user action, using the sandbox host when present. Never reads the clipboard. */
export declare function writeClipboardText(text: string): Promise<void>;

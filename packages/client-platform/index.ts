export type BackendConnection = { url: string; token: string };
export type PathSelection = string | string[] | null;
export type PathDialogOptions = {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
};

export interface PlatformWindow {
  /** Whether the native title bar overlaps the web content. */
  readonly titleBarStyle: "overlay" | "native";
  startDragging(): Promise<void>;
  /** Keep the window open until the caller permits closing. Returns a disposable subscription. */
  onCloseRequested(
    canClose: () => Promise<boolean>,
    onError: (error: unknown) => void,
  ): Promise<() => void>;
}

export interface ClientPlatform {
  readonly kind: "web" | "desktop";
  getBackendConnection(): Promise<BackendConnection | undefined>;
  openExternal(url: string): Promise<void>;
  /** Absent capabilities are reflected in UI rather than silently emulated. */
  openDialog?: (options: PathDialogOptions) => Promise<PathSelection>;
  revealPath?: (path: string) => Promise<void>;
  window?: PlatformWindow;
}

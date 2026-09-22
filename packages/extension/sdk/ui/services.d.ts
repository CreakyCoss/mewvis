/** Public, shared messages only. No internal paths, private context or credentials. */
export interface ExtensionSessionSnapshot {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
  }>;
  runs: Array<{
    id: string;
    status: "running" | "done" | "error" | null;
    startedAt: number | null;
    endedAt: number | null;
  }>;
  truncated: boolean;
}

/** Services exposed through a scoped host bridge. */
export interface ExtensionUIServices {
  /** Bound to the mounted session; the plugin cannot choose another target. */
  readonly session: { read(): Promise<ExtensionSessionSnapshot> };
}

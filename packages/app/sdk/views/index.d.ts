import type { ApplicationStorageValue } from "../data/index.js";

export type ApplicationViewValue = ApplicationStorageValue;
export interface ApplicationViewDocument {
  /** A self-contained browser bundle; external imports and network resources are blocked. */
  script: string;
  style?: string;
}
export interface ApplicationViewTheme {
  theme: "light" | "dark";
  themeTokens?: Readonly<Record<string, string>>;
}
export interface ApplicationViewRequestContext {
  /** Owner-selected logical identity, bound by the runtime rather than supplied by the child. */
  viewId: string;
  /** Aborted on request timeout, view removal, navigation, or disposal. */
  signal: AbortSignal;
}
export interface ApplicationViewOptions extends ApplicationViewDocument {
  id: string;
  title: string;
  /** An explicit method allowlist. No application tools, storage or chat are forwarded automatically. */
  methods?: Readonly<
    Record<
      string,
      (
        params: Readonly<Record<string, ApplicationViewValue>>,
        context: ApplicationViewRequestContext,
      ) => ApplicationViewValue | Promise<ApplicationViewValue>
    >
  >;
  onError?: (error: Error) => void;
}
export interface ApplicationView {
  readonly id: string;
  readonly state: "loading" | "ready" | "closed";
  /** Resolves after the child bundle's initial synchronous execution. */
  readonly ready: Promise<void>;
  /** Sends a bounded JSON event to this child. */
  postMessage(value: ApplicationViewValue): void;
  /** Idempotent; aborts handlers and closes the isolated frame. */
  dispose(): void;
}
export interface ApplicationViewHost {
  readonly version: 1;
  /** Mounts one opaque-origin iframe in an attached container. Dispose before reusing an ID. */
  mount(
    container: HTMLElement,
    options: ApplicationViewOptions,
  ): ApplicationView;
  dispose(): void;
}
export interface ApplicationViewClient {
  readonly version: 1;
  getHost(): Readonly<ApplicationViewTheme & { viewId: string }>;
  request<T = ApplicationViewValue>(
    method: string,
    params?: Record<string, ApplicationViewValue>,
  ): Promise<T>;
  subscribe(listener: (value: ApplicationViewValue) => void): () => void;
}
/** Requires the owner's embedded-views capability. */
export declare function mountApplicationView(
  container: HTMLElement,
  options: ApplicationViewOptions,
): ApplicationView;
/** Available only inside an embedded view. The child has no Isle application bridge. */
export declare function getApplicationViewClient(): ApplicationViewClient;

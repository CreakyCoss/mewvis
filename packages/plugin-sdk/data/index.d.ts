/** Plain, finite JSON data. undefined, bigint, class instances and cycles are rejected. */
export type PluginStorageValue =
  | null
  | boolean
  | number
  | string
  | readonly PluginStorageValue[]
  | { [key: string]: PluginStorageValue };

/** Persistent across application restarts; scoped to the authenticated plugin. */
export interface PluginStorage {
  /** Missing keys return null. T is a caller assertion, not runtime schema validation. */
  getItem<T = PluginStorageValue>(key: string): Promise<T | null>;
  /** Replaces one value; success means committed. No implicit merge or retry. */
  setItem(key: string, value: PluginStorageValue): Promise<void>;
  /** Removing a missing key succeeds. */
  removeItem(key: string): Promise<void>;
  /** Clears business keys only, never settings, workspaces, grants, files or chats. */
  clear(): Promise<void>;
  /** Returns a snapshot of business keys. Ordering is unspecified. */
  keys(): Promise<string[]>;
}

/** Registration metadata. Ordinary file operations use the existing sandbox and permission mode. */
export type PluginWorkspace = Readonly<{
  /** Stable workspace identity shared by its admitted plugins. */
  id: string;
  name: string;
  /** Host-normalized absolute directory for the plugin's own file and chat logic. */
  path: string;
  /** Whether this is the current plugin's default workspace. */
  isDefault: boolean;
}>;

export type PluginWorkspaceCreateInput = Readonly<{
  name: string;
  /** Omit to use the host's directory picker. An explicit path never bypasses sharing consent. */
  path?: string;
}>;

export interface PluginWorkspaces {
  /**
   * Creates or joins a workspace using the desktop's directory initialization rules.
   * The host owns the marker, membership, permissions and any sharing confirmation.
   * Returns null if the user cancels the picker or confirmation, without enrolling the plugin.
   */
  create(input: PluginWorkspaceCreateInput): Promise<PluginWorkspace | null>;
  /** Only this plugin's registered workspaces. Initializes its default once; never repairs missing directories. */
  list(): Promise<PluginWorkspace[]>;
  /**
   * Resolves an enrolled workspace and verifies directory availability; never creates or joins.
   * Unknown and unenrolled IDs both produce WORKSPACE_NOT_FOUND without revealing other plugins' records.
   */
  get(id: string): Promise<PluginWorkspace>;
}

export interface PluginDataClient {
  readonly storage: PluginStorage;
  readonly workspaces: PluginWorkspaces;
}

export declare const PLUGIN_DATA_PERMISSIONS: Readonly<{
  storage: "plugin-data";
  workspaces: "plugin-workspaces";
}>;

export type PluginDataErrorCode =
  | "CAPABILITY_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "INVALID_ARGUMENT"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_UNAVAILABLE"
  | "WORKSPACE_MARKER_INVALID"
  | "CONFIRMATION_UNAVAILABLE"
  | "STORAGE_ERROR"
  | "INTERNAL_ERROR"
  | "INVALID_RESPONSE"
  | "TRANSPORT_ERROR";

export type PluginDataErrorInfo = Readonly<{
  code: PluginDataErrorCode;
  message: string;
}>;

export declare class PluginDataError extends Error {
  readonly code: PluginDataErrorCode;
  constructor(
    code: PluginDataErrorCode,
    message: string,
    options?: { cause?: unknown },
  );
}

/** No plugin ID, membership list, approval flag, SQL or storage filename is caller-controlled. */
export type PluginDataRequest =
  | {
      version: 1;
      method: "storage.getItem" | "storage.removeItem";
      params: { key: string };
    }
  | {
      version: 1;
      method: "storage.setItem";
      params: { key: string; value: PluginStorageValue };
    }
  | { version: 1; method: "storage.clear" | "storage.keys" | "workspaces.list" }
  | {
      version: 1;
      method: "workspaces.create";
      params: PluginWorkspaceCreateInput;
    }
  | { version: 1; method: "workspaces.get"; params: { id: string } };

/** Void operations return a successful null value. User cancellation also returns successful null. */
export type PluginDataResponse =
  | { ok: true; value: PluginStorageValue }
  | { ok: false; error: PluginDataErrorInfo };

/** The host authenticates the connection and checks permissions on every request. */
export interface PluginDataTransport {
  readonly version: 1;
  request(request: PluginDataRequest): Promise<PluginDataResponse>;
}

/** Pure client: no filesystem, database, browser storage, permission grants or persistence fallback. */
export declare function createPluginDataClient(
  transport: PluginDataTransport,
): PluginDataClient;
/** Reads the current sandbox bridge; throws CAPABILITY_UNAVAILABLE on hosts without data v1. */
export declare function getPluginDataClient(): PluginDataClient;

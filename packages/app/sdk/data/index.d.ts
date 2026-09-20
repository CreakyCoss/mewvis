/** Plain, finite JSON data. undefined, bigint, class instances and cycles are rejected. */
export type ApplicationStorageValue =
  | null
  | boolean
  | number
  | string
  | readonly ApplicationStorageValue[]
  | { [key: string]: ApplicationStorageValue };

/** Persistent across application restarts; scoped to the authenticated application. */
export interface ApplicationStorage {
  /** Missing keys return null. T is a caller assertion, not runtime schema validation. */
  getItem<T = ApplicationStorageValue>(key: string): Promise<T | null>;
  /** Replaces one value; success means committed. No implicit merge or retry. */
  setItem(key: string, value: ApplicationStorageValue): Promise<void>;
  /** Removing a missing key succeeds. */
  removeItem(key: string): Promise<void>;
  /** Clears business keys only, never settings, workspaces, grants, files or chats. */
  clear(): Promise<void>;
  /** Returns a snapshot of business keys. Ordering is unspecified. */
  keys(): Promise<string[]>;
}

/** Registration metadata. Ordinary file operations use the existing sandbox and permission mode. */
export type ApplicationWorkspace = Readonly<{
  /** Stable workspace identity shared by its admitted applications. */
  id: string;
  name: string;
  /** Host-normalized absolute directory for the application's own file and chat logic. */
  path: string;
  /** Whether this is the current application's default workspace. */
  isDefault: boolean;
}>;

export type ApplicationWorkspaceCreateInput = Readonly<{
  name: string;
  /** Omit to use the host's directory picker. An explicit path never bypasses sharing consent. */
  path?: string;
  /** Require a new directory; never join or reuse existing content. */
  exclusive?: boolean;
}>;

export interface ApplicationWorkspaces {
  /** Select a directory without creating or registering a workspace. */
  selectDirectory(): Promise<string | null>;
  /** Detach this application. Content deletion is rejected for shared/default workspaces. */
  remove(input: { id: string; deleteContent?: boolean }): Promise<void>;
  /**
   * Creates or joins a workspace using the desktop's directory initialization rules.
   * The host owns the marker, membership, permissions and any sharing confirmation.
   * Returns null if the user cancels the picker or confirmation, without enrolling the application.
   */
  create(
    input: ApplicationWorkspaceCreateInput,
  ): Promise<ApplicationWorkspace | null>;
  /** Only this application's registered workspaces. Initializes its default once; never repairs missing directories. */
  list(): Promise<ApplicationWorkspace[]>;
  /**
   * Resolves an enrolled workspace and verifies directory availability; never creates or joins.
   * Unknown and unenrolled IDs both produce WORKSPACE_NOT_FOUND without revealing other applications' records.
   */
  get(id: string): Promise<ApplicationWorkspace>;
}

export interface ApplicationDataClient {
  readonly storage: ApplicationStorage;
  readonly workspaces: ApplicationWorkspaces;
}

export declare const APPLICATION_DATA_PERMISSIONS: Readonly<{
  storage: "application-data";
  workspaces: "application-workspaces";
}>;

export type ApplicationDataErrorCode =
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

export type ApplicationDataErrorInfo = Readonly<{
  code: ApplicationDataErrorCode;
  message: string;
}>;

export declare class ApplicationDataError extends Error {
  readonly code: ApplicationDataErrorCode;
  constructor(
    code: ApplicationDataErrorCode,
    message: string,
    options?: { cause?: unknown },
  );
}

/** No application ID, membership list, approval flag, SQL or storage filename is caller-controlled. */
export type ApplicationDataRequest =
  | {
      version: 1;
      method: "storage.getItem" | "storage.removeItem";
      params: { key: string };
    }
  | {
      version: 1;
      method: "storage.setItem";
      params: { key: string; value: ApplicationStorageValue };
    }
  | {
      version: 1;
      method:
        | "storage.clear"
        | "storage.keys"
        | "workspaces.list"
        | "workspaces.selectDirectory";
    }
  | {
      version: 1;
      method: "workspaces.create";
      params: ApplicationWorkspaceCreateInput;
    }
  | {
      version: 1;
      method: "workspaces.remove";
      params: { id: string; deleteContent?: boolean };
    }
  | { version: 1; method: "workspaces.get"; params: { id: string } };

/** Void operations return a successful null value. User cancellation also returns successful null. */
export type ApplicationDataResponse =
  | { ok: true; value: ApplicationStorageValue }
  | { ok: false; error: ApplicationDataErrorInfo };

/** The host authenticates the connection and checks permissions on every request. */
export interface ApplicationDataTransport {
  readonly version: 1;
  request(request: ApplicationDataRequest): Promise<ApplicationDataResponse>;
}

/** Pure client: no filesystem, database, browser storage, permission grants or persistence fallback. */
export declare function createApplicationDataClient(
  transport: ApplicationDataTransport,
): ApplicationDataClient;
/** Reads the current sandbox bridge; throws CAPABILITY_UNAVAILABLE on hosts without data v1. */
export declare function getApplicationDataClient(): ApplicationDataClient;

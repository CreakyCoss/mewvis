export const APPLICATION_ID = "@mewvis/app-workshop";
export const SOURCE_LIMIT = 128 * 1024;
export const PROJECT_LIMIT = 1024 * 1024;
export const FILE_LIMIT = 64;
export const SOURCE_DIRECTORY = "source";
export const MAIN_ENTRY = "src/main.tsx";
export const APP_ENTRY = "src/App.tsx";
export const STYLE_ENTRY = "src/styles.css";
export const DEPENDENCIES = [
  "react",
  "react/jsx-runtime",
  "react-dom/client",
  "@mewvis/app-sdk/views",
] as const;
export const AUTHORING_TOOLS = [
  "workshop_read_project",
  "workshop_read_file",
  "workshop_write_file",
  "workshop_delete_file",
  "workshop_build",
];

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  savedVersionId: string | null;
  error?: string;
}
export interface SavedVersion {
  id: string;
  createdAt: number;
  sourceRevision: number;
}
export interface ProjectDetail extends ProjectSummary {
  sourceRoot: "source";
  entry: "src/main.tsx";
  files: string[];
  versions: SavedVersion[];
  hasDraftBuild: boolean;
  /** Draft files that differ from the current saved version, including deletions. */
  changedFiles: string[];
}
export interface BuildArtifact {
  id: string;
  projectId: string;
  sourceHash: string;
  sourceRevision: number;
  createdAt: number;
  script: string;
  style: string;
}
export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}
export interface BuildResult {
  ok: boolean;
  project: ProjectDetail;
  artifact?: BuildArtifact;
  diagnostics: Diagnostic[];
}
export interface SourceFile {
  path: string;
  content: string;
  revision: number;
  savedContent: string | null;
}
export type FileMap = Record<string, string>;

export function validateFileName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !(
      value === ".gitignore" ||
      /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:tsx?|jsx?|css|json|md|txt|html)$/.test(
        value,
      )
    ) ||
    value
      .split("/")
      .some(
        (part) =>
          part === "." ||
          part === ".." ||
          part === "node_modules" ||
          part === "dist" ||
          (part.startsWith(".") && value !== ".gitignore"),
      )
  )
    throw new Error(
      "文件名须为 source 内的 JS、TS、CSS、JSON 或文本路径，不能包含隐藏目录或上级目录（仅允许根目录 .gitignore）。",
    );
  return value;
}

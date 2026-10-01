export const APPLICATION_ID = "@isle/app-workshop";
export const SOURCE_LIMIT = 128 * 1024;
export const PROJECT_LIMIT = 512 * 1024;
export const FILE_LIMIT = 32;
export const DEPENDENCIES = [
  "react",
  "react/jsx-runtime",
  "react-dom/client",
  "@isle/app-sdk/views",
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
  files: string[];
  versions: SavedVersion[];
  hasDraftBuild: boolean;
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
}
export type FileMap = Record<string, string>;

export function validateFileName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 120 ||
    !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:tsx?|jsx?|css)$/.test(value) ||
    value
      .split("/")
      .some((part) => part === "." || part === ".." || part.startsWith("."))
  )
    throw new Error(
      "文件名须为项目内的 JS、TS、TSX 或 CSS 路径，不能包含隐藏目录或上级目录。",
    );
  return value;
}

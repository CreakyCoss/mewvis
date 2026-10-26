/** 可嵌入的知识库 UI 入口。业务页面只依赖客户端，连接、身份与存储由接入方提供。 */
import type {
  KnowledgeClient,
  KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";
import { KnowledgeRoot } from "./root.js";

export type KnowledgeView = "workspace" | "manage" | "tasks";
export interface KnowledgeApplicationProps {
  readonly client: KnowledgeClient;
  readonly serviceLabel?: string;
  readonly initialView?: KnowledgeView;
  readonly initialKnowledgeBaseId?: string;
  /** 独立应用可显示模块导航；嵌入宿主时默认只显示页面内容。 */
  readonly navigation?: boolean;
  readonly preferences?: Pick<Storage, "getItem" | "setItem">;
  readonly onUnauthenticated?: () => void;
  readonly onConnectionSettings?: () => void;
  /** 可替换默认 UTF-8 TXT/Markdown 解析器；返回标准文本，不携带本机路径。 */
  readonly parseFile?: (
    file: File,
    signal: AbortSignal,
  ) => Promise<KnowledgeTextDocument>;
  readonly onOpenAttachment?: (reference: {
    readonly knowledgeBaseId: string;
    readonly attachmentId: string;
  }) => Promise<void>;
}

export function KnowledgeApplication(props: KnowledgeApplicationProps) {
  return <KnowledgeRoot {...props} />;
}

export {
  KnowledgeWorkbench,
  KnowledgeManagerPage,
  KnowledgeTasksPage,
} from "./pages.js";
export { KnowledgeDocumentView, KnowledgeSearchPanel } from "./reader.js";
export { KnowledgeImportDialog, KnowledgeBaseDialog } from "./dialogs.js";
export { useKnowledgeWorkspace } from "./workspace.js";
export type { KnowledgeWorkspace } from "./workspace.js";
export type {
  KnowledgeDocumentViewProps,
  KnowledgeSearchPanelProps,
} from "./reader.js";
export type {
  KnowledgeImportDialogProps,
  KnowledgeBaseDialogProps,
} from "./dialogs.js";

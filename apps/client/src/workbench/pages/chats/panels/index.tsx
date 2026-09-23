import { ActivityIcon, FolderIcon, GitBranchIcon } from "lucide-react";
import { uiSlotDefinitions } from "@isle/extension-sdk/ui";
import { useChatSnapshot } from "@/chat/react";
import { SidebarSlot } from "@/extensions/slots/sidebar";
import { UIIcon } from "@/extensions/slots/icons";
import { ChatPanels, ChatPanel } from "./layout";
import { WorkspaceFiles } from "./files";
import { WorkspaceVersionControl } from "./version-control";
import { ChatLedger } from "./ledger";

type ChatPanelTarget = { workspacePath: string; chatId: string };
function LedgerPanel(target: ChatPanelTarget) {
  const selectedModelId = useChatSnapshot().config.selectedModelId;
  return <ChatLedger {...target} selectedModelId={selectedModelId} />;
}

export function WorkspaceChatPanels(target: ChatPanelTarget) {
  return (
    <ChatPanels defaultValue="files">
      <ChatPanel icon={<FolderIcon className="size-4" />} value="files" title="文件">
        <WorkspaceFiles workspacePath={target.workspacePath} />
      </ChatPanel>
      <ChatPanel icon={<GitBranchIcon className="size-4" />} value="version" title="版本">
        <WorkspaceVersionControl workspacePath={target.workspacePath} />
      </ChatPanel>
      <ChatPanel icon={<ActivityIcon className="size-4" />} value="ledger" title="链路">
        <LedgerPanel {...target} />
      </ChatPanel>

      <SidebarSlot
        definition={uiSlotDefinitions.sessionSidebar}
        context={target}
        renderError={(error) => (
          <span title={error} aria-label="插件面板加载失败" className="text-destructive">
            !
          </span>
        )}
        render={({ key, title, icon, renderView }) => (
          <ChatPanel value={key} title={title} icon={<UIIcon name={icon} className="size-4" />}>
            {renderView}
          </ChatPanel>
        )}
      />
    </ChatPanels>
  );
}

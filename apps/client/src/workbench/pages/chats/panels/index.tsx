import { FolderIcon, GitBranchIcon } from "lucide-react";
import { uiSlotDefinitions } from "@isle/extension-host/ui";
import { SidebarSlot } from "@isle/extension-host/ui/slots/sidebar";
import { UIIcon } from "@isle/extension-host/ui/slots/icons";
import { ChatPanels, ChatPanel } from "./layout";
import { WorkspaceFiles } from "./files";
import { WorkspaceVersionControl } from "./version-control";

type ChatPanelTarget = { workspacePath: string; chatId: string };
export function WorkspaceChatPanels(target: ChatPanelTarget) {
  return (
    <ChatPanels defaultValue="files">
      <ChatPanel icon={<FolderIcon className="size-4" />} value="files" title="文件">
        <WorkspaceFiles workspacePath={target.workspacePath} />
      </ChatPanel>
      <ChatPanel icon={<GitBranchIcon className="size-4" />} value="version" title="版本">
        <WorkspaceVersionControl workspacePath={target.workspacePath} />
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

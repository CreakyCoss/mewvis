import { useEffect, useState, type ComponentType } from "react";
import { ActivityIcon, FolderIcon, GitBranchIcon, PanelRightIcon } from "lucide-react";
import { useChatSnapshot } from "@/chat/react";
import { WorkspaceFiles } from "./panels/files";
import { ChatLedger } from "./panels/ledger";
import { WorkspaceVersionControl } from "./panels/version-control";

export type WorkspaceChatPanel = "files" | "version" | "ledger";

type WorkspaceChatSidebarProps = {
  workspacePath: string;
  chatId: string;
  panels: WorkspaceChatPanel[];
};

type PanelDefinition = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const panelDefinitions = {
  files: {
    label: "文件",
    icon: FolderIcon,
  },
  version: {
    label: "版本",
    icon: GitBranchIcon,
  },
  ledger: {
    label: "链路",
    icon: ActivityIcon,
  },
} satisfies Record<WorkspaceChatPanel, PanelDefinition>;

const toolButtonClass =
  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

const toggleButtonClass =
  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary/10 data-[active=true]:text-primary";

export const WorkspaceChatSidebar = ({ workspacePath, chatId, panels }: WorkspaceChatSidebarProps) => {
  const selectedModelId = useChatSnapshot().config.selectedModelId;
  const [activePanel, setActivePanel] = useState<WorkspaceChatPanel>(panels[0] ?? "files");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!panels.includes(activePanel) && panels[0]) {
      setActivePanel(panels[0]);
    }
  }, [activePanel, panels]);

  if (panels.length === 0) {
    return null;
  }

  return (
    <>
      {isOpen ? (
        <aside className="flex w-[clamp(280px,22vw,360px)] min-w-0 shrink-0 overflow-hidden border-l border-border/70 bg-surface/70 text-foreground backdrop-blur-xl max-[1099px]:absolute max-[1099px]:inset-y-0 max-[1099px]:right-10 max-[1099px]:z-30 max-[1099px]:w-[min(360px,calc(100%_-_3.5rem))] max-[1099px]:bg-surface/95 max-[1099px]:shadow-[var(--shadow-floating)]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {activePanel === "files" ? <WorkspaceFiles workspacePath={workspacePath} /> : null}
            {activePanel === "version" ? <WorkspaceVersionControl workspacePath={workspacePath} /> : null}
            {activePanel === "ledger" ? (
              <ChatLedger workspacePath={workspacePath} chatId={chatId} selectedModelId={selectedModelId} />
            ) : null}
          </div>
        </aside>
      ) : null}

      <nav
        className="relative z-40 flex w-10 shrink-0 flex-col items-center gap-1.5 border-l border-border/60 bg-surface/70 px-1 py-2.5"
        aria-label="右侧工具"
      >
        <button
          type="button"
          className={toggleButtonClass}
          title={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-label={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-pressed={isOpen}
          data-active={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <PanelRightIcon className="size-4" />
        </button>
        <div className="h-px w-5 bg-border/70" />
        {panels.map((panel) => {
          const definition = panelDefinitions[panel];
          const Icon = definition.icon;
          const isSelected = isOpen && activePanel === panel;

          return (
            <button
              key={panel}
              type="button"
              className={toolButtonClass}
              title={definition.label}
              aria-label={`显示${definition.label}`}
              aria-pressed={isSelected}
              data-active={isSelected}
              onClick={() => {
                setActivePanel(panel);
                setIsOpen(true);
              }}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </nav>
    </>
  );
};

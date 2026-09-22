import {
  defineUIContribution,
  uiSlotDefinitions,
  type UIContributionFor,
  type UISessionContext,
} from "@isle/extension-sdk/ui";
import { useChatSnapshot } from "@/chat/react";
import { UISlot, useUISlotContext, type UIHostContribution } from "@/extensions/slots";
import { WorkspaceFiles } from "./files";
import { WorkspaceVersionControl } from "./version-control";
import { ChatLedger } from "./ledger";

const sidebar = uiSlotDefinitions.sessionSidebar;
function LedgerPanel() {
  const target = useUISlotContext(sidebar);
  const selectedModelId = useChatSnapshot().config.selectedModelId;
  return <ChatLedger {...target} selectedModelId={selectedModelId} />;
}
const panels: UIHostContribution<UIContributionFor<typeof sidebar>>[] = [
  {
    key: "native:files",
    contribution: defineUIContribution(sidebar, { id: "files", title: "文件", icon: "files", view: { id: "files" } }),
    renderView: (_view, context) => <WorkspaceFiles workspacePath={context.workspacePath} />,
  },
  {
    key: "native:version",
    contribution: defineUIContribution(sidebar, {
      id: "version",
      title: "版本",
      icon: "git-branch",
      view: { id: "version" },
    }),
    renderView: (_view, context) => <WorkspaceVersionControl workspacePath={context.workspacePath} />,
  },
  {
    key: "native:ledger",
    contribution: defineUIContribution(sidebar, {
      id: "ledger",
      title: "链路",
      icon: "activity",
      view: { id: "ledger" },
    }),
    renderView: () => <LedgerPanel />,
  },
];

/** The page mounts a protocol slot; each panel owns its data and services. */
export function WorkspaceChatPanels(context: UISessionContext) {
  return <UISlot definition={sidebar} context={context} contributions={panels} />;
}

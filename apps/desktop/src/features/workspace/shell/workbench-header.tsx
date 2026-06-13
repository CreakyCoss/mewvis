import { useState } from "react";
import {
  ChevronRight,
  GitBranch,
  LoaderCircle,
  PanelRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { WorkspaceVersionControlStatus } from "@/features/workspace/chat/types";
import { cn } from "@/lib/utils";

export type WorkbenchHeaderProps = {
  isContextPanelOpen: boolean;
  showToggle?: boolean;
  versionStatus?: WorkspaceVersionControlStatus | null;
  isVersionControlLoading?: boolean;
  isVersionControlInitializing?: boolean;
  isCreatingVersionBranch?: boolean;
  switchingVersionBranchName?: string;
  onToggleContextPanel: () => void;
  onRefreshVersionControl?: () => void;
  onInitializeVersionControl?: () => void;
  onCreateVersionBranch?: (branchName: string) => void;
  onSwitchVersionBranch?: (branchName: string) => void;
};

export const WorkbenchHeader = ({
  isContextPanelOpen,
  showToggle = true,
  versionStatus,
  isVersionControlLoading = false,
  isVersionControlInitializing = false,
  isCreatingVersionBranch = false,
  switchingVersionBranchName = "",
  onToggleContextPanel,
  onRefreshVersionControl,
  onInitializeVersionControl,
  onCreateVersionBranch,
  onSwitchVersionBranch,
}: WorkbenchHeaderProps) => {
  const [newBranchName, setNewBranchName] = useState("");
  const isVersionControlEnabled = versionStatus?.isEnabled ?? false;
  const isVersionStatusPending = !versionStatus && isVersionControlLoading;
  const currentBranchName =
    versionStatus?.branches.find((branch) => branch.isCurrent)?.name ??
    versionStatus?.currentRef ??
    "";
  const hasVersionMenuActions = Boolean(
    onRefreshVersionControl &&
      onInitializeVersionControl &&
      onCreateVersionBranch &&
      onSwitchVersionBranch,
  );
  const canSwitchBranch =
    isVersionControlEnabled &&
    !versionStatus?.hasChanges &&
    !switchingVersionBranchName &&
    !isVersionControlLoading &&
    (versionStatus?.branches.length ?? 0) > 1;
  const canCreateBranch =
    isVersionControlEnabled &&
    Boolean(versionStatus?.hasVersions) &&
    newBranchName.trim().length > 0 &&
    !isCreatingVersionBranch;

  const createBranch = () => {
    const branchName = newBranchName.trim();
    if (!branchName || !onCreateVersionBranch) {
      return;
    }
    onCreateVersionBranch(branchName);
    setNewBranchName("");
  };

  const versionMenu = showToggle && isContextPanelOpen && hasVersionMenuActions && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-9 max-w-[13rem] min-w-0 rounded-lg bg-background/85 px-2.5 text-muted-foreground shadow-[0_8px_20px_-18px_rgb(15_23_42_/_0.45)] backdrop-blur hover:bg-muted/70 hover:text-foreground",
            isVersionControlEnabled &&
              "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
          title="版本管理"
          aria-label="版本管理"
        >
          {isVersionControlLoading || isVersionControlInitializing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <GitBranch className="size-4" />
          )}
          <span className="min-w-0 truncate">
            {isVersionControlEnabled ? currentBranchName || "HEAD" : "版本"}
          </span>
          {isVersionControlEnabled && versionStatus?.head && (
            <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
              {versionStatus.head}
            </span>
          )}
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100] w-80">
        <DropdownMenuLabel>版本管理</DropdownMenuLabel>
        {!isVersionControlEnabled ? (
          <>
            <DropdownMenuItem disabled className="flex-col items-start gap-1">
              <span className="font-medium">
                {isVersionStatusPending ? "正在读取版本状态" : "未初始化版本仓库"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isVersionStatusPending
                  ? "正在读取版本状态。"
                  : "初始化后即可在本地提交、切换和回退。"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onInitializeVersionControl?.()}
              disabled={isVersionControlInitializing || isVersionControlLoading}
            >
              {isVersionControlInitializing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <GitBranch className="size-4" />
              )}
              初始化版本管理
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled className="flex-col items-start gap-1">
              <span className="max-w-full truncate font-medium">
                当前分支：{currentBranchName || "HEAD"}
              </span>
              {versionStatus?.head ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  当前提交 {versionStatus.head}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  还没有提交
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="data-disabled:pointer-events-none data-disabled:opacity-50"
                disabled={(versionStatus?.branches.length ?? 0) <= 1}
              >
                <GitBranch className="size-4" />
                切换分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-64">
                <DropdownMenuLabel>选择分支</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={currentBranchName}
                  onValueChange={(branchName) => {
                    if (branchName !== currentBranchName && canSwitchBranch) {
                      onSwitchVersionBranch?.(branchName);
                    }
                  }}
                >
                  {(versionStatus?.branches ?? []).map((branch) => (
                    <DropdownMenuRadioItem
                      key={branch.name}
                      value={branch.name}
                      disabled={branch.isCurrent || !canSwitchBranch}
                      className="min-w-0"
                    >
                      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                      {switchingVersionBranchName === branch.name ? (
                        <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                      ) : branch.shortHead ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {branch.shortHead}
                        </span>
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {versionStatus?.hasChanges && (versionStatus?.branches.length ?? 0) > 1 && (
                  <div className="px-2 py-1.5 text-xs leading-4 text-muted-foreground">
                    有未提交变更时不能切换分支。
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="data-disabled:pointer-events-none data-disabled:opacity-50"
                disabled={!versionStatus?.hasVersions}
              >
                <Plus className="size-4" />
                新建分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-72">
                <DropdownMenuLabel>新建并切换分支</DropdownMenuLabel>
                <div className="flex min-w-0 gap-1.5 p-2 pt-1">
                  <Input
                    value={newBranchName}
                    placeholder={
                      versionStatus?.hasVersions
                        ? "输入分支名称"
                        : "先完成一次提交"
                    }
                    className="h-8 min-w-0"
                    onChange={(event) => setNewBranchName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter" && canCreateBranch) {
                        event.preventDefault();
                        createBranch();
                      }
                    }}
                    disabled={!versionStatus?.hasVersions || isCreatingVersionBranch}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    title="新建并切换分支"
                    onClick={createBranch}
                    disabled={!canCreateBranch}
                  >
                    {isCreatingVersionBranch ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </Button>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onRefreshVersionControl?.()}
              disabled={isVersionControlLoading || isVersionControlInitializing}
            >
              {isVersionControlLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              刷新版本状态
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-12 bg-background/65 shadow-[0_8px_24px_-26px_rgb(15_23_42_/_0.28)] backdrop-blur-md" />
      <WindowDragRegion
        className={cn(
          "fixed top-0 left-0 z-[80] h-12",
          isContextPanelOpen ? "right-[18rem]" : "right-16",
        )}
      />
      {showToggle && (
        <div className="fixed top-1.5 right-4 z-[90] flex min-w-0 items-center justify-end gap-1.5">
          {versionMenu}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={[
              "size-9 rounded-lg shadow-[0_8px_20px_-18px_rgb(15_23_42_/_0.45)] backdrop-blur transition-colors",
              isContextPanelOpen
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "bg-background/85 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            ].join(" ")}
            title={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            aria-label={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
            onClick={onToggleContextPanel}
          >
            <PanelRight className="size-[18px]" />
          </Button>
        </div>
      )}
    </>
  );
};

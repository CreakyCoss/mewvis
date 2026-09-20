import {
  AlertTriangle,
  EllipsisVertical,
  FileJson2,
  FileText,
  Globe2,
  Loader2,
  Pencil,
  RefreshCw,
  Target,
  Trash2,
  UsersRound,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import type { StoryOverview, StoryProjectCompatibility } from "@story/project/types";

const StoryCardMetric = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) => (
  <span className="inline-flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs text-muted-foreground">
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate tabular-nums" title={`${value} ${label}`}>
      {value} {label}
    </span>
  </span>
);

export const StoryCard = ({
  overview,
  workspacePath,
  onEdit,
  onTavern,
  onDelete,
}: {
  overview: StoryOverview;
  workspacePath: string;
  onEdit: () => void;
  onTavern: () => void;
  onDelete: (deleteContent: boolean) => boolean | Promise<boolean>;
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteContent, setDeleteContent] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (await onDelete(deleteContent)) {
        setIsDeleteDialogOpen(false);
        setDeleteContent(false);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <article className="app-interactive-card relative flex h-full flex-col overflow-hidden rounded-xl border-t-2 border-t-primary">
        <div className="absolute top-2.5 right-2.5 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                title="更多操作"
                aria-label={`更多故事操作：${overview.title || "当前故事"}`}
                disabled={isDeleting}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                variant="destructive"
                disabled={isDeleting}
                onSelect={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                删除故事
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col text-left transition-colors hover:bg-accent/15 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
          onClick={onEdit}
        >
          <div className="flex min-w-0 flex-1 flex-col px-4 pt-3.5 pb-3">
            <div className="flex min-w-0 items-center gap-1.5 pr-8 text-xs font-semibold leading-5 text-primary">
              <FileJson2 className="size-3.5 shrink-0" />
              <span className="truncate" title="JSON 故事">
                JSON 故事
              </span>
            </div>

            <h3
              className="mt-3 min-w-0 truncate text-lg font-semibold leading-7 tracking-[-0.015em]"
              title={overview.title}
            >
              {overview.title}
            </h3>
            <p
              className="mt-1 min-h-10 text-sm leading-5 text-muted-foreground line-clamp-2"
              title={overview.description || "暂无故事设定。"}
            >
              {overview.description || "暂无故事设定。"}
            </p>

            <div className="mt-3 flex h-14 min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/10 bg-accent/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Target className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-5 text-foreground">当前目标</div>
                <div className="truncate" title={overview.goal || "暂无整体目标。"}>
                  {overview.goal || "暂无整体目标。"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 divide-x divide-border/70 overflow-hidden">
              <StoryCardMetric icon={UsersRound} label="角色" value={overview.resourceCounts.characters} />
              <StoryCardMetric icon={FileText} label="章节" value={overview.resourceCounts.chapters} />
              <StoryCardMetric icon={Globe2} label="设定" value={overview.resourceCounts.worldEntries} />
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 border-t bg-background/55">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 min-w-0 justify-center rounded-none border-r border-border/70 text-sm text-muted-foreground hover:text-foreground"
            onClick={onEdit}
          >
            <Pencil className="size-4 shrink-0" />
            <span className="truncate">编辑</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 min-w-0 justify-center rounded-none text-sm text-muted-foreground hover:text-foreground"
            onClick={onTavern}
          >
            <Wine className="size-4 shrink-0" />
            <span className="truncate">酒馆</span>
          </Button>
        </div>
      </article>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setIsDeleteDialogOpen(open);
          if (!open) setDeleteContent(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除故事？</AlertDialogTitle>
            <AlertDialogDescription>
              「{overview.title || "当前故事"}」将从故事列表中删除。默认会保留磁盘中的故事内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] p-3">
            <Checkbox
              className="mt-0.5"
              checked={deleteContent}
              onCheckedChange={(checked) => setDeleteContent(checked === true)}
              disabled={isDeleting}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">同时删除故事内容</span>
              <span className="mt-1 block break-all text-xs leading-5 text-muted-foreground">
                勾选后将永久删除整个工作区（包括 story/ 和 .tavern/）：{workspacePath}
              </span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              {isDeleting ? "正在删除" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const projectVersionLabel = (version: StoryProjectCompatibility["current"]) =>
  version
    ? `${version.storyTypeId}@${version.storyTypeVersion} · Definition v${version.formatVersion}`
    : "无法识别项目版本";

const targetVersionLabel = (version: StoryProjectCompatibility["target"]) =>
  version
    ? `${version.storyTypeId}@${version.storyTypeVersion} · Definition v${version.formatVersion}`
    : "无可用目标版本";

export const StoryUnavailableCard = ({
  name,
  workspacePath,
  compatibility,
  isUpgrading,
  onUpgrade,
  onDelete,
}: {
  name: string;
  workspacePath: string;
  compatibility: StoryProjectCompatibility;
  isUpgrading: boolean;
  onUpgrade: () => void | Promise<void>;
  onDelete: (deleteContent: boolean) => boolean | Promise<boolean>;
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteContent, setDeleteContent] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (await onDelete(deleteContent)) {
        setIsDeleteDialogOpen(false);
        setDeleteContent(false);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <article className="app-panel flex flex-col overflow-hidden rounded-2xl border-warning/25">
        <div className="relative h-[clamp(6.25rem,9vw,7.5rem)] overflow-hidden bg-gradient-to-br from-warning/15 via-muted to-background">
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-card/85 px-2.5 py-1 text-xs font-semibold text-warning backdrop-blur-md">
            <AlertTriangle className="size-3.5" />
            版本不兼容
          </span>
          <span className="absolute inset-x-4 bottom-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {workspacePath}
          </span>
        </div>

        <div className="flex flex-1 flex-col px-3.5 py-3">
          <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">{name}</h3>
          <div className="mt-3 rounded-lg border border-warning/20 bg-warning/[0.06] px-3 py-2.5 text-xs leading-5">
            <div className="font-medium text-foreground">{projectVersionLabel(compatibility.current)}</div>
            <div className="text-muted-foreground">目标：{targetVersionLabel(compatibility.target)}</div>
          </div>
          <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
            {compatibility.status === "upgrade-available"
              ? "项目文档已通过当前版本校验，可以安全升级项目定义。"
              : compatibility.reason || "当前版本无法读取这个故事项目。"}
          </p>
        </div>

        <div className="border-t bg-background/80 p-2.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 bg-background/80"
              disabled={isUpgrading || isDeleting}
              onClick={() => void onUpgrade()}
            >
              {isUpgrading ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {isUpgrading ? "正在升级" : "升级版本"}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0 bg-background/80 text-destructive hover:text-destructive"
              title="删除故事"
              aria-label="删除故事"
              disabled={isUpgrading || isDeleting}
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </article>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setIsDeleteDialogOpen(open);
          if (!open) setDeleteContent(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除不兼容的故事？</AlertDialogTitle>
            <AlertDialogDescription>
              「{name || "当前故事"}」将从故事列表中删除。默认会保留磁盘中的故事内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] p-3">
            <Checkbox
              className="mt-0.5"
              checked={deleteContent}
              onCheckedChange={(checked) => setDeleteContent(checked === true)}
              disabled={isDeleting}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">同时删除故事内容</span>
              <span className="mt-1 block break-all text-xs leading-5 text-muted-foreground">
                勾选后将永久删除整个工作区（包括 story/ 和 .tavern/）：{workspacePath}
              </span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              {isDeleting ? "正在删除" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

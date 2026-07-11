import { BookOpen, FileText, GitBranch, Pencil, Target, Trash2, UsersRound, Wine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { resolveAvatar } from "@/assets/avatars";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { StoryJson } from "../story/model/types";

const StoryCardMetric = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) => (
  <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5 text-[11px] text-foreground/80">
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">
      {value} {label}
    </span>
  </span>
);

export const StoryCard = ({
  story,
  onEdit,
  onManuscripts,
  onTavern,
  onDelete,
}: {
  story: StoryJson;
  onEdit: () => void;
  onManuscripts: () => void;
  onTavern: () => void;
  onDelete: () => void | Promise<void>;
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const visibleCharacters = story.characters.slice(0, 4);
  const hiddenCharacterCount = Math.max(0, story.characters.length - visibleCharacters.length);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <article className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_50px_-42px_rgb(15_23_42_/_0.55)] transition-colors hover:border-primary/20">
        <button
          type="button"
          className="flex min-w-0 flex-col text-left transition-colors hover:bg-accent/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={onEdit}
        >
          <div className="relative">
            <div className="h-[clamp(6.25rem,9vw,7.5rem)] w-full overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/15 via-muted to-background shadow-inner" />
            <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-teal-100/30 bg-slate-950/65 px-2.5 py-1 text-xs font-semibold leading-4 text-teal-50 shadow-[0_12px_28px_-18px_rgb(15_23_42_/_0.9)] ring-1 ring-teal-100/24 backdrop-blur-md">
              JSON 故事
            </span>
            <div className="absolute inset-x-0 -bottom-6 flex justify-start px-4">
              <div className="flex min-w-0 items-end overflow-hidden pb-px">
                {visibleCharacters.length > 0 ? (
                  <div className="flex min-w-0 items-end">
                    {visibleCharacters.map((character, index) => {
                      const avatar = resolveAvatar(character.avatar);
                      return (
                        <span
                          key={character.id}
                          className={[
                            "flex size-12 items-center justify-center overflow-hidden rounded-lg border-2 border-background bg-background shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]",
                            index > 0 ? "-ml-3" : "",
                          ].join(" ")}
                        >
                          <img src={avatar.src} alt={character.name} className="size-full object-cover" />
                        </span>
                      );
                    })}
                    {hiddenCharacterCount > 0 ? (
                      <span className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-lg border-2 border-background bg-background/95 text-sm font-semibold text-muted-foreground shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                        +{hiddenCharacterCount}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-lg border-2 border-background bg-background/90 text-primary shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                    <BookOpen className="size-5" />
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col px-3.5 pt-8 pb-3">
            <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">{story.title}</h3>
            <p className="mt-1.5 min-h-5 line-clamp-1 text-xs leading-5 text-muted-foreground">
              {story.premise || "暂无故事设定。"}
            </p>

            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <StoryCardMetric icon={UsersRound} label="角色" value={story.characters.length} />
              <StoryCardMetric icon={GitBranch} label="节点" value={story.graph.nodes.length} />
              <StoryCardMetric icon={BookOpen} label="场景" value={story.scenes.length} />
            </div>

            <div className="mt-2.5">
              <div className="border-t pt-2.5">
                <div className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <Target className="absolute -right-3 -bottom-4 size-14 text-primary/5" />
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Target className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-5 text-foreground">当前目标</div>
                    <div className="line-clamp-1">{story.goal || "暂无整体目标。"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>

        <div className="border-t bg-background/80 p-2.5">
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
              onClick={onEdit}
            >
              <Pencil className="size-4 shrink-0" />
              <span className="truncate">编辑</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
              onClick={onManuscripts}
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">稿件</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
              onClick={onTavern}
            >
              <Wine className="size-4 shrink-0" />
              <span className="truncate">酒馆</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0 bg-background/80 text-destructive hover:text-destructive"
              title="删除故事及工作区"
              aria-label="删除故事及工作区"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </article>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setIsDeleteDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除故事？</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{story.title || "当前故事"}」及其整个故事工作区？这个操作会同时删除 story/ 和 .tavern/ 运行时数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
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
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

import { Eye, Folder, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SkillSourceBadge } from "../shared";

type GroupRowProps = {
  id: string;
  name: string;
  count: number;
  enabledCount: number;
  selected: boolean;
  readonly: boolean;
  source?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onToggle?: (enabled: boolean) => void;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

export const GroupRow = ({
  id,
  name,
  count,
  enabledCount,
  selected,
  readonly,
  source,
  disabled,
  onSelect,
  onToggle,
  onView,
  onEdit,
  onDelete,
}: GroupRowProps) => {
  const fullyEnabled = count > 0 && enabledCount === count;
  const progress = count > 0 ? Math.round((enabledCount / count) * 100) : 0;

  return (
    <article
      className={[
        "rounded-lg border bg-background p-3 shadow-xs transition-all",
        selected
          ? "border-sidebar-primary/35 bg-sidebar-primary/5 shadow-sm"
          : "border-border/70 hover:border-sidebar-primary/25 hover:bg-muted/20",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => onSelect(id)}
        >
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
            <Folder className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <SkillSourceBadge source={source} readonly={readonly} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {enabledCount}/{count}
              </span>
            </span>
          </span>
        </button>
        {onToggle && (
          <Switch
            checked={fullyEnabled}
            disabled={disabled}
            aria-label={`${name} 分组启用状态`}
            onCheckedChange={onToggle}
          />
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-sidebar-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onView}
          aria-label={`查看 ${name}`}
        >
          <Eye className="size-3.5" />
        </Button>
        {!readonly && (
          <>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onEdit}
              aria-label={`编辑 ${name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              aria-label={`删除 ${name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </article>
  );
};

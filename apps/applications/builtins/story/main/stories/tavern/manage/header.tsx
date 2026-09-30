import { Wine, X } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import {
  DialogDescription,
  DialogTitle,
} from "design-system/components/ui/dialog";
export const Header = ({
  title,
  onClose,
  disabled,
}: {
  title: string;
  onClose: () => void;
  disabled: boolean;
}) => (
  <header className="relative flex shrink-0 items-center gap-4 px-4 pt-[var(--tavern-header-padding-top,1.25rem)] pb-[var(--tavern-header-padding-bottom,1rem)] pr-16 sm:px-[var(--tavern-content-padding,1.5rem)] sm:pr-16">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
      <Wine className="size-6" aria-hidden="true" />
    </span>
    <div className="min-w-0">
      <DialogTitle className="text-xl font-semibold leading-7">
        酒馆设置
      </DialogTitle>
      <DialogDescription className="mt-1 truncate text-sm leading-6">
        {title.trim() || "未命名酒馆"} · 调整酒馆的呈现、叙事与运行方式。
      </DialogDescription>
    </div>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-5 right-4"
      aria-label="关闭酒馆设置"
      onClick={onClose}
      disabled={disabled}
    >
      <X className="size-5" />
    </Button>
  </header>
);

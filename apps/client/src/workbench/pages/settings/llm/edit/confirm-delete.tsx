import { useId, useState, type ReactNode } from "react";
import { Button } from "design-system/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";

export function ConfirmDelete({
  title,
  description,
  onConfirm,
  onCloseAutoFocus,
  children,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={16}
        className="z-90 w-72 max-w-[calc(100vw-2rem)] gap-3 rounded-lg p-3"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="space-y-1">
          <h4 id={`${id}-title`} className="text-xs font-medium">
            {title}
          </h4>
          <p id={`${id}-description`} className="text-[11px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            确认删除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type WindowDragRegionProps = ComponentPropsWithoutRef<"div">;

export const WindowDragRegion = ({
  onMouseDown,
  ...props
}: WindowDragRegionProps) => {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event);
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <div
      {...props}
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    />
  );
};

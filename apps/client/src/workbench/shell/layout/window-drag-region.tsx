import { platform } from "@/platform";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";

type WindowDragRegionProps = ComponentPropsWithoutRef<"div">;

export const WindowDragRegion = ({ onMouseDown, ...props }: WindowDragRegionProps) => {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(event);
    if (!platform.window || event.defaultPrevented || event.button !== 0) {
      return;
    }

    void platform.window.startDragging().catch(() => undefined);
  };

  return <div {...props} onMouseDown={handleMouseDown} />;
};

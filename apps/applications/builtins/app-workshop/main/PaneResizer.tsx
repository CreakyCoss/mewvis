import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { GripVertical } from "lucide-react";

type WidthBounds = { min: number; max: number };

export function PaneResizer({
  className,
  label,
  paneRef,
  containerRef,
  getBounds,
  defaultWidth,
  side,
  onResize,
  onReset,
  onResizingChange,
}: {
  className: string;
  label: string;
  paneRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  getBounds(width: number): WidthBounds;
  defaultWidth: number;
  side: "left" | "right";
  onResize(width: number): void;
  onReset(): void;
  onResizingChange(resizing: boolean): void;
}) {
  const [measuredWidth, setMeasuredWidth] = useState(defaultWidth);
  const [bounds, setBounds] = useState(() => getBounds(0));
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    min: number;
    max: number;
  } | null>(null);
  const direction = side === "left" ? -1 : 1;
  useEffect(() => {
    const pane = paneRef.current;
    const container = containerRef.current;
    if (!pane || !container) return;
    const measure = () => {
      const width = Math.round(pane.getBoundingClientRect().width);
      const nextBounds = getBounds(container.getBoundingClientRect().width);
      if (width > 0)
        setMeasuredWidth((current) => (current === width ? current : width));
      setBounds((current) =>
        current.min === nextBounds.min && current.max === nextBounds.max
          ? current
          : nextBounds,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(container);
    return () => observer.disconnect();
  }, [paneRef, containerRef, getBounds]);
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
    onResizingChange(false);
  };
  const width = Math.round(
    Math.max(bounds.min, Math.min(bounds.max, measuredWidth)),
  );
  return (
    <div
      className={`${className} ${resizing ? "is-resizing" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={width}
      aria-valuetext={`${width} 像素`}
      tabIndex={0}
      title="左右拖动调整宽度，双击恢复默认"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: paneRef.current?.getBoundingClientRect().width ?? width,
          ...getBounds(containerRef.current?.getBoundingClientRect().width ?? 0),
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        setResizing(true);
        onResizingChange(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        onResize(
          Math.round(
            Math.max(
              current.min,
              Math.min(
                current.max,
                current.startWidth +
                  direction * (event.clientX - current.startX),
              ),
            ),
          ),
        );
      }}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      onLostPointerCapture={(event) => finishResize(event)}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const currentBounds = getBounds(
          containerRef.current?.getBoundingClientRect().width ?? 0,
        );
        const currentWidth =
          paneRef.current?.getBoundingClientRect().width ?? width;
        const step = event.shiftKey ? 32 : 16;
        const next =
          event.key === "ArrowRight"
            ? currentWidth + direction * step
            : event.key === "ArrowLeft"
              ? currentWidth - direction * step
              : event.key === "Home"
                ? currentBounds.min
                : event.key === "End"
                  ? currentBounds.max
                  : null;
        if (next === null) return;
        event.preventDefault();
        onResize(Math.max(currentBounds.min, Math.min(currentBounds.max, next)));
      }}
    >
      <GripVertical aria-hidden="true" />
    </div>
  );
}

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

const minWidth = 300;
const maxWidth = 720;
const clamp = (width: number, bounds: { min: number; max: number }) =>
  Math.round(Math.max(bounds.min, Math.min(bounds.max, width)));

function widthBounds(container: HTMLElement | null) {
  const directoryWidth = container
    ? parseFloat(
        getComputedStyle(container).getPropertyValue("--film-directory-width"),
      ) || 0
    : 0;
  // Leave 400px for the editor and 56px for the tool rail.
  return {
    min: minWidth,
    max: Math.max(
      minWidth,
      Math.min(maxWidth, (container?.clientWidth ?? 0) - directoryWidth - 456),
    ),
  };
}

export function AssistantResizer({
  containerRef,
  panelRef,
  onResize,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  onResize: (width: number | null) => void;
}) {
  const [width, setWidth] = useState(360);
  const [bounds, setBounds] = useState({ min: minWidth, max: maxWidth });
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;
    const measure = () => {
      const nextBounds = widthBounds(container);
      const actual = Math.round(panel.getBoundingClientRect().width);
      const nextWidth = clamp(actual, nextBounds);
      setBounds((current) =>
        current.max === nextBounds.max ? current : nextBounds,
      );
      setWidth(nextWidth);
      if (actual > 0 && nextWidth !== actual) onResize(nextWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [containerRef, panelRef, onResize]);

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={`film-assistant-resizer ${resizing ? "is-resizing" : ""}`}
      role="separator"
      aria-label="调整创作助手宽度"
      aria-controls="film-assistant-panel"
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
          startWidth: panelRef.current?.getBoundingClientRect().width ?? width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        onResize(
          clamp(
            start.startWidth + start.startX - event.clientX,
            widthBounds(containerRef.current),
          ),
        );
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(event) => {
        const currentBounds = widthBounds(containerRef.current);
        const actual = panelRef.current?.getBoundingClientRect().width ?? width;
        const step = event.shiftKey ? 32 : 16;
        const next =
          event.key === "ArrowLeft"
            ? actual + step
            : event.key === "ArrowRight"
              ? actual - step
              : event.key === "Home"
                ? currentBounds.min
                : event.key === "End"
                  ? currentBounds.max
                  : null;
        if (next === null) return;
        event.preventDefault();
        onResize(clamp(next, currentBounds));
      }}
    />
  );
}

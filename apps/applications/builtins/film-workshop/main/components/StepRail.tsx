import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function StepRail({
  as = "nav",
  id,
  className,
  label,
  activeKey,
  children,
}: {
  as?: "nav" | "ol";
  id?: string;
  className: string;
  label: string;
  activeKey: string | number;
  children: ReactNode;
}) {
  const railRef = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({
    overflow: false,
    left: false,
    right: false,
  });
  const updateBounds = () => {
    const rail = railRef.current;
    if (!rail) return;
    const maximum = rail.scrollWidth - rail.clientWidth;
    const next = {
      overflow: maximum > 1,
      left: rail.scrollLeft > 1,
      right: rail.scrollLeft < maximum - 1,
    };
    setBounds((previous) =>
      previous.overflow === next.overflow &&
      previous.left === next.left &&
      previous.right === next.right
        ? previous
        : next,
    );
  };
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const revealCurrent = () => {
      const active = rail.querySelector<HTMLElement>(
        '[aria-current="step"], .is-current',
      );
      if (active) {
        const item = active.getBoundingClientRect();
        const viewport = rail.getBoundingClientRect();
        if (item.left < viewport.left)
          rail.scrollLeft += item.left - viewport.left - 4;
        else if (item.right > viewport.right)
          rail.scrollLeft += item.right - viewport.right + 4;
      }
      updateBounds();
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeKey, as]);
  const move = (direction: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(116, rail.clientWidth * 0.8),
      behavior: "auto",
    });
    updateBounds();
  };
  return (
    <div className="film-step-carousel" data-overflow={bounds.overflow}>
      <button
        className="film-step-scroll-button"
        aria-label="向左查看步骤"
        aria-controls={id}
        disabled={!bounds.left}
        onClick={() => move(-1)}
      >
        <ChevronLeft size={18} />
      </button>
      {createElement(
        as,
        {
          ref: railRef,
          id,
          className,
          "aria-label": label,
          onScroll: updateBounds,
        },
        children,
      )}
      <button
        className="film-step-scroll-button"
        aria-label="向右查看步骤"
        aria-controls={id}
        disabled={!bounds.right}
        onClick={() => move(1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

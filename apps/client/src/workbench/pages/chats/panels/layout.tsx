import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";

type PanelState = {
  contentRoot: HTMLDivElement | null;
  isActive(value: string): boolean;
  open(value: string): void;
};
const PanelContext = createContext<PanelState | null>(null);

/** Owns the two layout regions; each child declares its button and content together. */
export function ChatPanels({
  defaultValue,
  defaultOpen = false,
  children,
}: {
  defaultValue: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [contentRoot, setContentRoot] = useState<HTMLDivElement | null>(null);
  const state = useMemo<PanelState>(
    () => ({
      contentRoot,
      isActive: (value) => isOpen && selectedValue === value,
      open: (value) => {
        setSelectedValue(value);
        setIsOpen(true);
      },
    }),
    [contentRoot, isOpen, selectedValue],
  );
  return (
    <PanelContext.Provider value={state}>
      <div ref={setContentRoot} className="contents" />
      <nav
        className="relative z-40 flex w-10 shrink-0 flex-col items-center gap-1.5 border-l border-border/60 bg-surface/70 px-1 py-2.5"
        aria-label="右侧工具"
      >
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
          title={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-label={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-pressed={isOpen}
          data-active={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <PanelRightIcon className="size-4" /> : <PanelLeftIcon className="size-4" />}
        </button>
        <div className="h-px w-5 bg-border/70" />
        {children}
      </nav>
    </PanelContext.Provider>
  );
}

/** The portal changes DOM placement while retaining the declaring component's React context. */
export function ChatPanel({
  value,
  title,
  icon,
  children,
}: {
  value: string;
  title: string;
  icon: ReactNode;
  children: ReactNode | (() => ReactNode);
}) {
  const state = useContext(PanelContext);
  if (!state) throw new Error("ChatPanels is required");
  const { contentRoot, isActive, open } = state;
  const active = isActive(value);
  return (
    <>
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
        title={title}
        aria-label={`显示${title}`}
        aria-pressed={active}
        data-active={active}
        onClick={() => open(value)}
      >
        {icon}
      </button>
      {active && contentRoot
        ? createPortal(
            <aside
              aria-label={title}
              className="flex w-[clamp(280px,22vw,360px)] min-w-0 shrink-0 overflow-hidden border-l border-border/70 bg-surface/70 text-foreground backdrop-blur-xl max-[1099px]:absolute max-[1099px]:inset-y-0 max-[1099px]:right-10 max-[1099px]:z-30 max-[1099px]:w-[min(360px,calc(100%_-_3.5rem))] max-[1099px]:bg-surface/95 max-[1099px]:shadow-[var(--shadow-floating)]"
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {typeof children === "function" ? children() : children}
              </div>
            </aside>,
            contentRoot,
            value,
          )
        : null}
    </>
  );
}

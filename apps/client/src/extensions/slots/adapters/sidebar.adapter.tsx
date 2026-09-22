import { useState } from "react";
import { PanelRightIcon } from "lucide-react";
import { uiSlotTypes } from "@isle/extension-sdk/ui";
import { defineUIAdapter, type UIAdapterProps } from "../adapter";
import { UIIcon } from "../icons";

const toolButtonClass =
  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

const toggleButtonClass =
  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary/10 data-[active=true]:text-primary";

/** Owns only panel selection and layout, regardless of the source of each panel. */
export function SidebarSlotAdapter({ contributions: panels, context, error }: UIAdapterProps<"sidebar">) {
  const [selectedId, setSelectedId] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const selected = panels.find((panel) => panel.key === selectedId) ?? panels[0];
  // Forget removed panels so re-enabling a contribution does not unexpectedly select it again.
  if (selectedId !== selected?.key) setSelectedId(selected?.key);

  if (!panels.length && !error) return null;

  return (
    <>
      {isOpen && selected ? (
        <aside className="flex w-[clamp(280px,22vw,360px)] min-w-0 shrink-0 overflow-hidden border-l border-border/70 bg-surface/70 text-foreground backdrop-blur-xl max-[1099px]:absolute max-[1099px]:inset-y-0 max-[1099px]:right-10 max-[1099px]:z-30 max-[1099px]:w-[min(360px,calc(100%_-_3.5rem))] max-[1099px]:bg-surface/95 max-[1099px]:shadow-[var(--shadow-floating)]">
          <div key={selected.key} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected.renderView(selected.contribution.view, context)}
          </div>
        </aside>
      ) : null}

      <nav
        className="relative z-40 flex w-10 shrink-0 flex-col items-center gap-1.5 border-l border-border/60 bg-surface/70 px-1 py-2.5"
        aria-label="右侧工具"
      >
        <button
          type="button"
          className={toggleButtonClass}
          title={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-label={isOpen ? "收起右侧面板" : "展开右侧面板"}
          aria-pressed={isOpen}
          disabled={!selected}
          data-active={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <PanelRightIcon className="size-4" />
        </button>
        <div className="h-px w-5 bg-border/70" />
        {panels.map((panel) => {
          const isSelected = isOpen && selected?.key === panel.key;

          return (
            <button
              key={panel.key}
              type="button"
              className={toolButtonClass}
              title={panel.contribution.title}
              aria-label={`显示${panel.contribution.title}`}
              aria-pressed={isSelected}
              data-active={isSelected}
              onClick={() => {
                setSelectedId(panel.key);
                setIsOpen(true);
              }}
            >
              <UIIcon name={panel.contribution.icon} className="size-4" />
            </button>
          );
        })}
        {error ? (
          <span title={error} aria-label="面板加载失败" className="text-destructive">
            !
          </span>
        ) : null}
      </nav>
    </>
  );
}

export default defineUIAdapter(uiSlotTypes.sidebar, { mode: "supported", component: SidebarSlotAdapter });

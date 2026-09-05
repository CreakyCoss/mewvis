import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { LexicalEditor } from "lexical";

type ReferenceMenuProps<Option extends MenuOption> = {
  editor: LexicalEditor;
  anchorElement: HTMLElement | null;
  ariaLabel: string;
  title: string;
  emptyText: string;
  options: Option[];
  selectedIndex: number | null;
  selectOption: (option: Option) => void;
  setHighlightedIndex: (index: number) => void;
  renderOption: (option: Option) => ReactNode;
};

// 文件、技能等引用类型共用同一套候选菜单和定位逻辑。
export const ReferenceMenu = <Option extends MenuOption>({
  editor,
  anchorElement,
  ariaLabel,
  title,
  emptyText,
  options,
  selectedIndex,
  selectOption,
  setHighlightedIndex,
  renderOption,
}: ReferenceMenuProps<Option>) => {
  const editorElement = editor.getRootElement();
  if (!anchorElement || !editorElement) {
    return null;
  }

  const editorRect = editorElement.getBoundingClientRect();
  const viewportPadding = 16;
  const menuWidth = Math.min(480, editorRect.width, window.innerWidth - viewportPadding * 2);
  const menuLeft = Math.min(
    Math.max(viewportPadding, editorRect.left),
    window.innerWidth - menuWidth - viewportPadding,
  );

  return createPortal(
    <div
      role="listbox"
      aria-label={ariaLabel}
      className="fixed z-50 overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[var(--shadow-floating)]"
      style={{
        bottom: window.innerHeight - editorRect.top + 8,
        left: menuLeft,
        width: menuWidth,
      }}
    >
      <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="max-h-72 overflow-y-auto p-1.5">
        {options.length ? (
          options.map((option, index) => (
            <button
              key={option.key}
              ref={option.setRefElement}
              type="button"
              role="option"
              aria-selected={selectedIndex === index}
              className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              data-selected={selectedIndex === index}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
            >
              {renderOption(option)}
            </button>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </div>
    </div>,
    anchorElement,
  );
};

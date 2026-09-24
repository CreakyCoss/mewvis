import { Fragment, type ReactNode, type Ref } from "react";
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
  getGroupLabel?: (option: Option) => string | null;
};

type ReferenceOptionsListProps<Option extends { key: string }> = {
  options: Option[];
  emptyText: string;
  selectedIndex: number | null;
  selectOption: (option: Option) => void;
  setHighlightedIndex: (index: number) => void;
  renderOption: (option: Option) => ReactNode;
  getGroupLabel?: (option: Option) => string | null;
  optionRef?: (option: Option) => Ref<HTMLButtonElement>;
  optionIdPrefix?: string;
  className?: string;
  listRef?: Ref<HTMLDivElement>;
};

export const ReferenceOptionsList = <Option extends { key: string }>({
  options,
  emptyText,
  selectedIndex,
  selectOption,
  setHighlightedIndex,
  renderOption,
  getGroupLabel,
  optionRef,
  optionIdPrefix = "typeahead-item",
  className = "max-h-72 overflow-y-auto p-1.5 pr-4",
  listRef,
}: ReferenceOptionsListProps<Option>) => (
  <div ref={listRef} className={className}>
    {options.length ? (
      options.map((option, index) => {
        const groupLabel = getGroupLabel?.(option);
        const previousGroupLabel = index > 0 ? getGroupLabel?.(options[index - 1]) : null;
        return (
          <Fragment key={option.key}>
            {groupLabel && groupLabel !== previousGroupLabel && (
              <div role="presentation" className="truncate px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {groupLabel}
              </div>
            )}
            <button
              id={`${optionIdPrefix}-${index}`}
              ref={optionRef?.(option)}
              type="button"
              role="option"
              aria-selected={selectedIndex === index}
              className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              data-selected={selectedIndex === index}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              {renderOption(option)}
            </button>
          </Fragment>
        );
      })
    ) : (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
    )}
  </div>
);

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
  getGroupLabel,
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
      <ReferenceOptionsList
        options={options}
        emptyText={emptyText}
        selectedIndex={selectedIndex}
        selectOption={selectOption}
        setHighlightedIndex={setHighlightedIndex}
        renderOption={renderOption}
        getGroupLabel={getGroupLabel}
        optionRef={(option) => option.setRefElement}
      />
    </div>,
    anchorElement,
  );
};

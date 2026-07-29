import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileTextIcon } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption, type TriggerFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode, type TextNode } from "lexical";
import type { ChatInputFile } from "../type";
import { $createFileReferenceNode } from "./file-reference-node";

const MAX_VISIBLE_FILES = 8;

// 支持“请阅读@文件”这种中文连续输入，同时避免把常见邮箱地址识别成文件引用。
const fileReferenceTrigger: TriggerFn = (text) => {
  const match = /@([^\s@，。；,;]*)$/.exec(text);
  if (!match) {
    return null;
  }

  const previousCharacter = match.index > 0 ? text[match.index - 1] : "";
  if (previousCharacter && /[a-zA-Z0-9._%+-]/.test(previousCharacter)) {
    return null;
  }

  return {
    leadOffset: match.index,
    matchingString: match[1],
    replaceableString: match[0],
  };
};

class FileReferenceOption extends MenuOption {
  file: ChatInputFile;

  constructor(file: ChatInputFile) {
    super(file.path);
    this.file = file;
  }
}

type FileReferenceMenuProps = {
  files: ChatInputFile[];
};

export const FileReferenceMenu = ({ files }: FileReferenceMenuProps) => {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(() => {
    if (query === null) {
      return [];
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();
    return files
      .filter((file) => {
        if (file.isDirectory) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }

        return `${file.name}\n${file.path}`.toLocaleLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftName = left.name.toLocaleLowerCase();
        const rightName = right.name.toLocaleLowerCase();
        const leftStartsWithQuery = normalizedQuery && leftName.startsWith(normalizedQuery) ? 0 : 1;
        const rightStartsWithQuery = normalizedQuery && rightName.startsWith(normalizedQuery) ? 0 : 1;
        return leftStartsWithQuery - rightStartsWithQuery || left.path.localeCompare(right.path, "zh-CN");
      })
      .slice(0, MAX_VISIBLE_FILES)
      .map((file) => new FileReferenceOption(file));
  }, [files, query]);

  const selectOption = useCallback(
    (option: FileReferenceOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const referenceNode = $createFileReferenceNode(option.file.path, option.file.name);
        if (nodeToReplace) {
          nodeToReplace.replace(referenceNode);
        }
        const trailingSpace = $createTextNode(" ");
        referenceNode.insertAfter(trailingSpace);
        trailingSpace.selectEnd();
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<FileReferenceOption>
      triggerFn={fileReferenceTrigger}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={selectOption}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        const editorElement = editor.getRootElement();
        if (!anchorElementRef.current || !editorElement) {
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
            aria-label="工作区文件"
            className="fixed z-50 overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[var(--shadow-floating)]"
            style={{
              bottom: window.innerHeight - editorRect.top + 8,
              left: menuLeft,
              width: menuWidth,
            }}
          >
            <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
              引用工作区文件
            </div>
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
                    title={option.file.path}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectOptionAndCleanUp(option);
                    }}
                  >
                    <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{option.file.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{option.file.path}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的文件</div>
              )}
            </div>
          </div>,
          anchorElementRef.current,
        );
      }}
    />
  );
};

import { useCallback, useMemo, useState } from "react";
import { FileTextIcon } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption, type TriggerFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode, type TextNode } from "lexical";
import type { ChatInputFile } from "@/chat/react/types";
import { ReferenceMenu } from "../menu";
import { $createFileReferenceNode } from "./node";

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
      menuRenderFn={(anchorElementRef, menu) => (
        <ReferenceMenu
          editor={editor}
          anchorElement={anchorElementRef.current}
          ariaLabel="工作区文件"
          title="引用工作区文件"
          emptyText="没有匹配的文件"
          options={menu.options}
          selectedIndex={menu.selectedIndex}
          selectOption={menu.selectOptionAndCleanUp}
          setHighlightedIndex={menu.setHighlightedIndex}
          renderOption={(option) => (
            <>
              <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1" title={option.file.path}>
                <span className="block truncate text-sm font-medium">{option.file.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{option.file.path}</span>
              </span>
            </>
          )}
        />
      )}
    />
  );
};

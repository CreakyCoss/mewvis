import { useCallback, useMemo, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption, type TriggerFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode, $getRoot, $getSelection, $isRangeSelection, type TextNode } from "lexical";
import type { ChatInputSkillOption } from "@/chat/react/types";
import { ReferenceMenu } from "../menu";
import { $createSkillReferenceNode } from "./node";

type SlashOption = ChatInputSkillOption & { commandId?: string };
const MAX_VISIBLE_SKILLS = 8;

// 允许“请使用/技能”连续输入，但不响应 @文件路径和普通英文路径中的斜杠。
const skillReferenceTrigger: TriggerFn = (text) => {
  const match = /\/([^\s/@，。；,;]*)$/.exec(text);
  if (!match) {
    return null;
  }

  const previousToken = text.slice(0, match.index).match(/[^\s，。；,;]*$/)?.[0] ?? "";
  const previousCharacter = match.index > 0 ? text[match.index - 1] : "";
  if (previousToken.includes("@") || (previousCharacter && /[a-zA-Z0-9._%+-]/.test(previousCharacter))) {
    return null;
  }

  return {
    leadOffset: match.index,
    matchingString: match[1],
    replaceableString: match[0],
  };
};

class SkillReferenceOption extends MenuOption {
  skill: SlashOption;

  constructor(skill: SlashOption) {
    super(skill.key);
    this.skill = skill;
  }
}

type SkillReferenceMenuProps = {
  skills: ChatInputSkillOption[];
  commands?: { id: string; description: string }[];
};

export const SkillReferenceMenu = ({ skills, commands = [] }: SkillReferenceMenuProps) => {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(false);
  const trigger: TriggerFn = useCallback(
    (text) => {
      const match = skillReferenceTrigger(text, editor);
      const firstParagraph = editor.getEditorState().read(() => {
        const selection = $getSelection();
        return (
          $isRangeSelection(selection) && selection.anchor.getNode().getTopLevelElement() === $getRoot().getFirstChild()
        );
      });
      setAtStart(Boolean(match && firstParagraph && !text.slice(0, match.leadOffset).trim()));
      return match;
    },
    [editor],
  );
  const options = useMemo(() => {
    if (query === null) {
      return [];
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const entries: SlashOption[] = [
      ...(atStart ? commands : []).map((command) => ({
        key: command.id,
        name: command.description,
        label: command.description,
        description: `/${command.id}`,
        commandId: command.id,
      })),
      ...skills,
    ];
    return entries
      .filter((skill) => {
        if (!normalizedQuery) {
          return true;
        }
        return `${skill.name}\n${skill.description}\n${skill.key}`.toLocaleLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftName = left.name.toLocaleLowerCase();
        const rightName = right.name.toLocaleLowerCase();
        const leftStartsWithQuery = normalizedQuery && leftName.startsWith(normalizedQuery) ? 0 : 1;
        const rightStartsWithQuery = normalizedQuery && rightName.startsWith(normalizedQuery) ? 0 : 1;
        return leftStartsWithQuery - rightStartsWithQuery || left.name.localeCompare(right.name, "zh-CN");
      })
      .slice(0, MAX_VISIBLE_SKILLS)
      .map((skill) => new SkillReferenceOption(skill));
  }, [query, skills, commands, atStart]);

  const selectOption = useCallback(
    (option: SkillReferenceOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const referenceNode = option.skill.commandId
          ? $createTextNode(`/${option.skill.commandId}`)
          : $createSkillReferenceNode(option.skill.key, option.skill.name);
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
    <LexicalTypeaheadMenuPlugin<SkillReferenceOption>
      triggerFn={trigger}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={selectOption}
      menuRenderFn={(anchorElementRef, menu) => (
        <ReferenceMenu
          editor={editor}
          anchorElement={anchorElementRef.current}
          ariaLabel="命令与技能"
          title="命令与技能"
          emptyText="没有匹配的已启用命令或技能"
          options={menu.options}
          selectedIndex={menu.selectedIndex}
          selectOption={menu.selectOptionAndCleanUp}
          setHighlightedIndex={menu.setHighlightedIndex}
          renderOption={(option) => (
            <>
              <SparklesIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1" title={option.skill.description}>
                <span className="block truncate text-sm font-medium">{option.skill.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {option.skill.description || option.skill.key}
                </span>
              </span>
            </>
          )}
        />
      )}
    />
  );
};

import { useCallback, useMemo, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption, type TriggerFn } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode, type TextNode } from "lexical";
import type { ChatInputSkillOption } from "../../../type";
import { ReferenceMenu } from "../menu";
import { $createSkillReferenceNode } from "./node";

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
  skill: ChatInputSkillOption;

  constructor(skill: ChatInputSkillOption) {
    super(skill.key);
    this.skill = skill;
  }
}

type SkillReferenceMenuProps = {
  skills: ChatInputSkillOption[];
};

export const SkillReferenceMenu = ({ skills }: SkillReferenceMenuProps) => {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const options = useMemo(() => {
    if (query === null) {
      return [];
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();
    return skills
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
  }, [query, skills]);

  const selectOption = useCallback(
    (option: SkillReferenceOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const referenceNode = $createSkillReferenceNode(option.skill.key, option.skill.name);
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
      triggerFn={skillReferenceTrigger}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={selectOption}
      menuRenderFn={(anchorElementRef, menu) => (
        <ReferenceMenu
          editor={editor}
          anchorElement={anchorElementRef.current}
          ariaLabel="技能"
          title="引用技能"
          emptyText="没有匹配的已启用技能"
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

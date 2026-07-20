import { useId } from "react";
import { Check, ChevronDown, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatInputStore } from "../store";

type SkillMenuProps = {
  disabled: boolean;
};

export const SkillMenu = ({ disabled }: SkillMenuProps) => {
  const selectAllId = useId();
  const resourceStore = useChatInputStore();
  const skillGroups = resourceStore.resources.skillGroups ?? [];
  const skills = [
    ...new Map(skillGroups.flatMap((group) => group.skills.map((skill) => [skill.key, skill] as const))).values(),
  ];
  const selectedSkillKeys = new Set(resourceStore.optionValues.selectedSkillKeys);
  const selectedSkills = skills.filter((skill) => selectedSkillKeys.has(skill.key));
  const areAllSkillsSelected = skills.length > 0 && selectedSkills.length === skills.length;
  const hasSelectedSkills = selectedSkills.length > 0;
  const selectedSkillLabel = hasSelectedSkills ? `${selectedSkills.length} 个` : "未选择";
  const selectedSkillTitle = hasSelectedSkills ? selectedSkills.map((skill) => skill.label).join("、") : "未选择技能";

  const setSkillKeysSelected = (skillKeys: string[], selected: boolean) => {
    const nextSelectedSkillKeys = new Set(resourceStore.optionValues.selectedSkillKeys);

    skillKeys.forEach((skillKey) => {
      if (selected) {
        nextSelectedSkillKeys.add(skillKey);
      } else {
        nextSelectedSkillKeys.delete(skillKey);
      }
    });

    resourceStore.setSelectedSkillKeys([...nextSelectedSkillKeys]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 min-w-0 max-w-[13rem] cursor-pointer px-2 text-xs"
          title={`技能：${selectedSkillTitle}`}
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span>技能</span>
          <span className="min-w-0 truncate text-muted-foreground">{selectedSkillLabel}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        <div className="flex h-9 items-center gap-2 px-2">
          <DropdownMenuLabel className="min-w-0 flex-1 truncate p-0">技能选择</DropdownMenuLabel>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {selectedSkills.length}/{skills.length}
          </span>
          <label htmlFor={selectAllId} className="shrink-0 cursor-pointer text-xs text-muted-foreground">
            全选
          </label>
          <Checkbox
            id={selectAllId}
            checked={areAllSkillsSelected ? true : hasSelectedSkills ? "indeterminate" : false}
            disabled={skills.length === 0}
            aria-label="全选技能"
            className="[&_[data-slot=checkbox-indicator]_svg]:stroke-white"
            onCheckedChange={(checked) =>
              resourceStore.setSelectedSkillKeys(checked === true ? skills.map((skill) => skill.key) : [])
            }
          />
        </div>
        <DropdownMenuSeparator />
        {skillGroups.length > 0 && (
          <>
            {skillGroups.map((group) => {
              const groupSkillKeys = [...new Set(group.skills.map((skill) => skill.key))];
              const selectedGroupSkillCount = groupSkillKeys.filter((skillKey) =>
                selectedSkillKeys.has(skillKey),
              ).length;
              const areAllGroupSkillsSelected =
                groupSkillKeys.length > 0 && selectedGroupSkillCount === groupSkillKeys.length;
              const hasSelectedGroupSkills = selectedGroupSkillCount > 0;

              return (
                <DropdownMenuSub key={group.value}>
                  <DropdownMenuSubTrigger
                    disabled={groupSkillKeys.length === 0}
                    className="h-9 gap-2.5"
                    title={group.description || undefined}
                    onClick={() => setSkillKeysSelected(groupSkillKeys, !areAllGroupSkillsSelected)}
                  >
                    <SkillSelectionIndicator
                      selected={areAllGroupSkillsSelected}
                      indeterminate={!areAllGroupSkillsSelected && hasSelectedGroupSkills}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate font-medium">{group.label}</span>
                      {group.isDefault && <DefaultBadge />}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {selectedGroupSkillCount}/{groupSkillKeys.length}
                    </span>
                  </DropdownMenuSubTrigger>

                  <DropdownMenuSubContent className="w-72">
                    <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {group.skills.map((skill) => (
                      <DropdownMenuCheckboxItem
                        key={`${group.value}:${skill.key}`}
                        checked={selectedSkillKeys.has(skill.key)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => setSkillKeysSelected([skill.key], checked === true)}
                        title={skill.description || undefined}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{skill.label}</span>
                          {skill.description && (
                            <span className="block truncate text-xs text-muted-foreground">{skill.description}</span>
                          )}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

type SkillSelectionIndicatorProps = {
  selected: boolean;
  indeterminate: boolean;
};

const SkillSelectionIndicator = ({ selected, indeterminate }: SkillSelectionIndicatorProps) => (
  <span
    className={`flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border ${
      selected || indeterminate ? "border-primary bg-primary text-primary-foreground" : "border-input bg-transparent"
    }`}
    aria-hidden="true"
  >
    {selected ? (
      <Check className="size-2.5" stroke="white" />
    ) : indeterminate ? (
      <Minus className="size-2.5" stroke="white" />
    ) : null}
  </span>
);

const DefaultBadge = () => (
  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
    默认
  </span>
);

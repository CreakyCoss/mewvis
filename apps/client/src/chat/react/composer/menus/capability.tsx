import { useId, useState } from "react";
import { ChevronRight, Database, Sparkles } from "lucide-react";
import { Checkbox } from "design-system/components/ui/checkbox";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "design-system/components/ui/dropdown-menu";
import type { useChatControls } from "../../provider";

type CapabilitySubmenusProps = {
  controls: ReturnType<typeof useChatControls>;
  disabled: boolean;
};

// Overlay scrollbars otherwise cover the right-aligned checkmarks while scrolling.
const scrollableMenuClassName = "max-h-96 w-80 overflow-y-auto pr-5";

export const CapabilitySubmenus = ({ disabled, controls }: CapabilitySubmenusProps) => {
  const skillSelectAllId = useId();
  const knowledgeSelectAllId = useId();
  const skillGroupIdPrefix = useId();
  const [expandedSkillGroups, setExpandedSkillGroups] = useState<Set<string>>(() => new Set());
  const resourceStore = controls;
  const skillGroups = resourceStore.resources.skillGroups ?? [];
  const skills = [
    ...new Map(skillGroups.flatMap((group) => group.skills.map((skill) => [skill.key, skill] as const))).values(),
  ];
  const knowledgeCollections = resourceStore.resources.knowledgeCollections ?? [];

  const selectedSkillKeys = new Set(resourceStore.options.selectedSkillKeys);
  const selectedKnowledgeIds = new Set(resourceStore.options.selectedKnowledgeCollectionIds);
  const selectedSkillCount = skills.filter((skill) => selectedSkillKeys.has(skill.key)).length;
  const selectedKnowledgeCount = knowledgeCollections.filter((collection) =>
    selectedKnowledgeIds.has(collection.value),
  ).length;
  const updateSelectedSkills = (skillKeys: string[], selected: boolean) => {
    const nextKeys = new Set(resourceStore.options.selectedSkillKeys);
    skillKeys.forEach((skillKey) => (selected ? nextKeys.add(skillKey) : nextKeys.delete(skillKey)));
    resourceStore.updateOptions({ selectedSkillKeys: [...nextKeys] });
  };

  const updateSelectedKnowledge = (collectionId: string, selected: boolean) => {
    const nextIds = new Set(resourceStore.options.selectedKnowledgeCollectionIds);
    selected ? nextIds.add(collectionId) : nextIds.delete(collectionId);
    resourceStore.updateOptions({ selectedKnowledgeCollectionIds: [...nextIds] });
  };
  const toggleSkillGroup = (groupId: string) => {
    setExpandedSkillGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <>
      <DropdownMenuSub>
        <CapabilityTrigger
          icon={Sparkles}
          label="技能"
          selected={selectedSkillCount}
          total={skills.length}
          disabled={disabled}
        />
        <DropdownMenuSubContent className={scrollableMenuClassName}>
          <SelectionHeader
            id={skillSelectAllId}
            label="技能"
            selected={selectedSkillCount}
            total={skills.length}
            onCheckedChange={(selected) =>
              resourceStore.updateOptions({ selectedSkillKeys: selected ? skills.map((skill) => skill.key) : [] })
            }
          />
          <DropdownMenuSeparator />
          {skillGroups.length === 0 ? (
            <EmptyItem title="暂无可用技能" description="请先在技能设置中添加或启用" />
          ) : (
            skillGroups.map((group, groupIndex) => {
              const groupSkillKeys = [...new Set(group.skills.map((skill) => skill.key))];
              const selectedGroupCount = groupSkillKeys.filter((skillKey) => selectedSkillKeys.has(skillKey)).length;
              const expanded = expandedSkillGroups.has(group.value);

              return (
                <div key={group.value}>
                  {groupIndex > 0 && <DropdownMenuSeparator />}
                  <SelectionHeader
                    id={`${skillGroupIdPrefix}-${groupIndex}`}
                    label={group.label}
                    selected={selectedGroupCount}
                    total={groupSkillKeys.length}
                    badge={group.isDefault ? "默认" : undefined}
                    expanded={expanded}
                    onToggle={() => toggleSkillGroup(group.value)}
                    onCheckedChange={(selected) => updateSelectedSkills(groupSkillKeys, selected)}
                  />
                  {expanded &&
                    group.skills.map((skill) => (
                      <DropdownMenuCheckboxItem
                        key={`${group.value}:${skill.key}`}
                        checked={selectedSkillKeys.has(skill.key)}
                        className="min-h-12 items-start py-2 pl-5"
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => updateSelectedSkills([skill.key], checked === true)}
                        title={skill.description || undefined}
                      >
                        <ItemText label={skill.label} description={skill.description} />
                      </DropdownMenuCheckboxItem>
                    ))}
                </div>
              );
            })
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <CapabilityTrigger
          icon={Database}
          label="知识库"
          selected={selectedKnowledgeCount}
          total={knowledgeCollections.length}
          disabled={disabled}
        />
        <DropdownMenuSubContent className={scrollableMenuClassName}>
          <SelectionHeader
            id={knowledgeSelectAllId}
            label="知识库"
            selected={selectedKnowledgeCount}
            total={knowledgeCollections.length}
            onCheckedChange={(selected) =>
              resourceStore.updateOptions({
                selectedKnowledgeCollectionIds: selected
                  ? knowledgeCollections.map((collection) => collection.value)
                  : [],
              })
            }
          />
          <DropdownMenuSeparator />
          {knowledgeCollections.length === 0 ? (
            <EmptyItem title="暂无已启用的知识库" description="请先在知识库设置中启用" />
          ) : (
            knowledgeCollections.map((collection) => (
              <DropdownMenuCheckboxItem
                key={collection.value}
                checked={selectedKnowledgeIds.has(collection.value)}
                className="min-h-14 items-start py-2"
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => updateSelectedKnowledge(collection.value, checked === true)}
                title={collection.sourceDirectory ?? collection.description ?? undefined}
              >
                <ItemText
                  label={collection.label}
                  description={collection.description || collection.sourceDirectory || "已启用知识检索"}
                />
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
};

type CapabilityTriggerProps = {
  icon: typeof Sparkles;
  label: string;
  selected: number;
  total: number;
  disabled: boolean;
};

const CapabilityTrigger = ({ icon: Icon, label, selected, total, disabled }: CapabilityTriggerProps) => (
  <DropdownMenuSubTrigger disabled={disabled}>
    <Icon className="size-3.5" aria-hidden="true" />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="max-w-32 truncate text-xs tabular-nums text-muted-foreground">
      {selected}/{total}
    </span>
  </DropdownMenuSubTrigger>
);

type SelectionHeaderProps = {
  id: string;
  label: string;
  selected: number;
  total: number;
  badge?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onCheckedChange: (selected: boolean) => void;
};

const SelectionHeader = ({
  id,
  label,
  selected,
  total,
  badge,
  expanded,
  onToggle,
  onCheckedChange,
}: SelectionHeaderProps) => {
  const hasSelection = selected > 0;
  const allSelected = total > 0 && selected === total;

  return (
    <div className="flex min-h-10 items-center gap-2 px-2">
      {onToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-1 text-left text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{label}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none">
              {badge}
            </span>
          )}
        </button>
      ) : (
        <DropdownMenuLabel className="min-w-0 flex-1 truncate p-0">{label}</DropdownMenuLabel>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {selected}/{total}
      </span>
      <label htmlFor={id} className="shrink-0 cursor-pointer text-xs text-muted-foreground">
        全选
      </label>
      <Checkbox
        id={id}
        checked={allSelected ? true : hasSelection ? "indeterminate" : false}
        disabled={total === 0}
        aria-label={`全选${label}`}
        className="[&_[data-slot=checkbox-indicator]_svg]:stroke-primary-foreground"
        onCheckedChange={(checked) => onCheckedChange(checked === true)}
      />
    </div>
  );
};

const ItemText = ({ label, description }: { label: string; description?: string | null }) => (
  <span className="min-w-0 flex-1">
    <span className="block truncate font-medium">{label}</span>
    {description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>}
  </span>
);

const EmptyItem = ({ title, description }: { title: string; description?: string }) => (
  <DropdownMenuItem disabled className="min-h-14 items-start py-2">
    <span>
      <span className="block text-sm">{title}</span>
      {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
    </span>
  </DropdownMenuItem>
);

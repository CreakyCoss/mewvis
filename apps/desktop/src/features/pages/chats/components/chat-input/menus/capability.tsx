import { useId } from "react";
import { ChevronDown, Database, Puzzle, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatInputStore } from "../store";

type CapabilityMenuProps = {
  disabled: boolean;
};

export const CapabilityMenu = ({ disabled }: CapabilityMenuProps) => {
  const skillSelectAllId = useId();
  const knowledgeSelectAllId = useId();
  const toolSelectAllId = useId();
  const skillGroupIdPrefix = useId();
  const resourceStore = useChatInputStore();
  const skillGroups = resourceStore.resources.skillGroups ?? [];
  const skills = [
    ...new Map(skillGroups.flatMap((group) => group.skills.map((skill) => [skill.key, skill] as const))).values(),
  ];
  const knowledgeCollections = resourceStore.resources.knowledgeCollections ?? [];
  const tools = resourceStore.resources.tools ?? [];

  const selectedSkillKeys = new Set(resourceStore.options.selectedSkillKeys);
  const selectedKnowledgeIds = new Set(resourceStore.options.selectedKnowledgeCollectionIds);
  const selectedToolNames = new Set(resourceStore.options.selectedToolNames);
  const selectedSkillCount = skills.filter((skill) => selectedSkillKeys.has(skill.key)).length;
  const selectedKnowledgeCount = knowledgeCollections.filter((collection) =>
    selectedKnowledgeIds.has(collection.value),
  ).length;
  const selectedToolCount = tools.filter((tool) => selectedToolNames.has(tool.value)).length;
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

  const updateSelectedTools = (toolName: string, selected: boolean) => {
    const nextNames = new Set(resourceStore.options.selectedToolNames);
    selected ? nextNames.add(toolName) : nextNames.delete(toolName);
    resourceStore.updateOptions({ selectedToolNames: [...nextNames] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-9 min-w-0 max-w-[24rem] cursor-pointer px-2 text-xs"
          title={`技能 ${selectedSkillCount}/${skills.length}；知识库 ${selectedKnowledgeCount}/${knowledgeCollections.length}；工具 ${selectedToolCount}/${tools.length}`}
        >
          <Puzzle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>能力</span>
          <span className="min-w-0 truncate text-muted-foreground">
            技能 {selectedSkillCount} · 知识库 {selectedKnowledgeCount} · 工具 {selectedToolCount}
          </span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>对话能力</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <CapabilityTrigger
            icon={Sparkles}
            label="技能"
            description="按任务自动调用"
            selected={selectedSkillCount}
            total={skills.length}
          />
          <DropdownMenuSubContent className="max-h-96 w-80 overflow-y-auto">
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

                return (
                  <div key={group.value}>
                    {groupIndex > 0 && <DropdownMenuSeparator />}
                    <SelectionHeader
                      id={`${skillGroupIdPrefix}-${groupIndex}`}
                      label={group.label}
                      selected={selectedGroupCount}
                      total={groupSkillKeys.length}
                      badge={group.isDefault ? "默认" : undefined}
                      onCheckedChange={(selected) => updateSelectedSkills(groupSkillKeys, selected)}
                    />
                    {group.skills.map((skill) => (
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
            description="参与知识检索"
            selected={selectedKnowledgeCount}
            total={knowledgeCollections.length}
          />
          <DropdownMenuSubContent className="max-h-96 w-80 overflow-y-auto">
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

        <DropdownMenuSub>
          <CapabilityTrigger
            icon={Wrench}
            label="工具"
            description="允许模型执行操作"
            selected={selectedToolCount}
            total={tools.length}
          />
          <DropdownMenuSubContent className="max-h-96 w-72 overflow-y-auto">
            <SelectionHeader
              id={toolSelectAllId}
              label="工具"
              selected={selectedToolCount}
              total={tools.length}
              onCheckedChange={(selected) =>
                resourceStore.updateOptions({ selectedToolNames: selected ? tools.map((tool) => tool.value) : [] })
              }
            />
            <DropdownMenuSeparator />
            {tools.length === 0 ? (
              <EmptyItem title="暂无可用工具" />
            ) : (
              tools.map((tool) => (
                <DropdownMenuCheckboxItem
                  key={tool.value}
                  checked={selectedToolNames.has(tool.value)}
                  className="min-h-12 items-start py-2"
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => updateSelectedTools(tool.value, checked === true)}
                  title={tool.description || undefined}
                >
                  <ItemText label={tool.label} description={tool.description} />
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

type CapabilityTriggerProps = {
  icon: typeof Sparkles;
  label: string;
  description: string;
  selected: number;
  total: number;
};

const CapabilityTrigger = ({ icon: Icon, label, description, selected, total }: CapabilityTriggerProps) => (
  <DropdownMenuSubTrigger className="min-h-12 gap-2.5 py-2">
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{label}</span>
      <span className="block truncate text-xs text-muted-foreground">{description}</span>
    </span>
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
  onCheckedChange: (selected: boolean) => void;
};

const SelectionHeader = ({ id, label, selected, total, badge, onCheckedChange }: SelectionHeaderProps) => {
  const hasSelection = selected > 0;
  const allSelected = total > 0 && selected === total;

  return (
    <div className="flex min-h-10 items-center gap-2 px-2">
      <DropdownMenuLabel className="min-w-0 flex-1 truncate p-0">
        {label}
        {badge && (
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none">
            {badge}
          </span>
        )}
      </DropdownMenuLabel>
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
        className="[&_[data-slot=checkbox-indicator]_svg]:stroke-white"
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

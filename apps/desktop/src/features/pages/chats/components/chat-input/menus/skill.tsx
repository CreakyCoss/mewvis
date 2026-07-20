import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatInputStore } from "../store";

type SkillMenuProps = {
  disabled: boolean;
};

export const SkillMenu = ({ disabled }: SkillMenuProps) => {
  const resourceStore = useChatInputStore();
  const skillGroups = resourceStore.resources.skillGroups ?? [];
  const selectedSkillGroups = skillGroups.filter((group) => resourceStore.selectedSkillGroupIds.includes(group.value));
  const defaultSkillGroup = skillGroups.find((group) => group.isDefault) ?? null;
  const areAllSkillGroupsSelected = skillGroups.length > 0 && selectedSkillGroups.length === skillGroups.length;
  const selectedSkillGroupLabel =
    resourceStore.selectedSkillGroupIds.length === 0
      ? "不使用技能"
      : areAllSkillGroupsSelected
        ? "全部"
        : selectedSkillGroups.length <= 2
          ? selectedSkillGroups.map((group) => group.label).join("、") || "不使用技能"
          : `${selectedSkillGroups
              .slice(0, 2)
              .map((group) => group.label)
              .join("、")} 等 ${selectedSkillGroups.length} 组`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 min-w-0 max-w-[13rem] cursor-pointer px-2 text-xs"
          title={`技能组：${selectedSkillGroupLabel}`}
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span>技能组</span>
          <span className="min-w-0 truncate text-muted-foreground">{selectedSkillGroupLabel}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>技能组（当前对话）</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={areAllSkillGroupsSelected}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) =>
            resourceStore.setSelectedSkillGroupIds(checked ? skillGroups.map((group) => group.value) : [])
          }
        >
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">全部</span>
              {!defaultSkillGroup && <DefaultBadge />}
            </span>
            <span className="block truncate text-xs text-muted-foreground">使用 Skill 库中的全部技能</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={resourceStore.selectedSkillGroupIds.length === 0}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => resourceStore.setSelectedSkillGroupIds([])}
        >
          <span className="min-w-0">
            <span className="block truncate">不使用技能</span>
            <span className="block truncate text-xs text-muted-foreground">本次对话不注入 Skill 上下文</span>
          </span>
        </DropdownMenuCheckboxItem>
        {skillGroups.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {skillGroups.map((group) => (
              <DropdownMenuCheckboxItem
                key={group.value}
                checked={resourceStore.selectedSkillGroupIds.includes(group.value)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  resourceStore.setSelectedSkillGroupIds(
                    checked
                      ? [...new Set([...resourceStore.selectedSkillGroupIds, group.value])]
                      : resourceStore.selectedSkillGroupIds.filter((id) => id !== group.value),
                  )
                }
                title={group.description || undefined}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{group.label}</span>
                    {group.isDefault && <DefaultBadge />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{group.skills.length} 个 Skill</span>
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const DefaultBadge = () => (
  <span className="shrink-0 rounded-full bg-sidebar-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sidebar-primary">
    默认
  </span>
);

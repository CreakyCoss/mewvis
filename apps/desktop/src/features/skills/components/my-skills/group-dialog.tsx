import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderPlus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkspaceSkill, WorkspaceSkillGroup } from "../../types";
import { EmptyState, SkillSourceBadge } from "../shared";
import {
  existingGroupSkillNames,
  filterSkills,
  nextCustomGroupOrder,
  skillContentPreview,
  skillDescriptionPreview,
} from "../utils";

export type GroupDialogMode = "create" | "view" | "edit";

export type GroupDialogState = {
  open: boolean;
  mode: GroupDialogMode;
  group: WorkspaceSkillGroup | null;
  fallbackName?: string;
  fallbackSkillNames?: string[];
};

type GroupDialogProps = {
  state: GroupDialogState;
  groups: WorkspaceSkillGroup[];
  skills: WorkspaceSkill[];
  skillsByKey: Map<string, WorkspaceSkill>;
  onOpenChange: (open: boolean) => void;
  onGroupsChange: (groups: WorkspaceSkillGroup[]) => void;
  onSelectedGroupChange: (groupId: string) => void;
};

export const GroupDialog = ({
  state,
  groups,
  skills,
  skillsByKey,
  onOpenChange,
  onGroupsChange,
  onSelectedGroupChange,
}: GroupDialogProps) => {
  const [groupName, setGroupName] = useState("");
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const isEditable = state.mode !== "view" && state.group?.readonly !== true;
  const dialogTitle = getDialogTitle(state.mode, state.group?.readonly === true);
  const visibleSkills = useMemo(
    () => filterSkills(skills, searchQuery),
    [searchQuery, skills],
  );

  useEffect(() => {
    if (!state.open) {
      return;
    }

    if (state.mode === "create") {
      setGroupName("");
      setSelectedSkillNames([]);
    } else {
      setGroupName(state.group?.name ?? state.fallbackName ?? "");
      setSelectedSkillNames(
        state.group
          ? existingGroupSkillNames(state.group, skillsByKey)
          : state.fallbackSkillNames ?? [],
      );
    }
    setSearchQuery("");
    setError("");
  }, [
    skillsByKey,
    state.fallbackName,
    state.fallbackSkillNames,
    state.group,
    state.mode,
    state.open,
  ]);

  const toggleSkill = (skillKey: string, checked: boolean) => {
    setSelectedSkillNames((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(skillKey);
      } else {
        next.delete(skillKey);
      }
      return [...next].sort();
    });
  };

  const saveGroup = () => {
    const name = groupName.trim();
    if (!name) {
      setError("分组名称不能为空");
      return;
    }
    if (selectedSkillNames.length === 0) {
      setError("至少选择一个技能");
      return;
    }
    const duplicated = groups.some(
      (group) => group.id !== state.group?.id && group.name === name,
    );
    if (duplicated) {
      setError("分组名称已存在");
      return;
    }

    const id = state.group?.id ?? `draft-${crypto.randomUUID()}`;
    const nextGroup: WorkspaceSkillGroup = {
      id,
      name,
      description: state.group?.description ?? null,
      source: "custom",
      readonly: false,
      order: state.group?.order ?? nextCustomGroupOrder(groups),
      skillNames: [...selectedSkillNames].sort(),
    };
    const nextGroups = state.group
      ? groups.map((group) => (group.id === state.group?.id ? nextGroup : group))
      : [...groups, nextGroup];

    onGroupsChange(nextGroups);
    onSelectedGroupChange(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-transparent p-0 shadow-lg sm:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-4 pr-9">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FolderPlus className="size-4 text-sidebar-primary" />
                <span>{dialogTitle}</span>
              </DialogTitle>
              <DialogDescription className="mt-2">
                {isEditable
                  ? "从当前技能广场中勾选技能，组成这个工作区可复用的技能分组。"
                  : "查看这个分组包含的技能，系统分组不可直接修改。"}
              </DialogDescription>
            </div>
            <Badge variant={isEditable ? "default" : "outline"}>
              {selectedSkillNames.length}/{skills.length}
            </Badge>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="absolute top-3 right-3"
              onClick={() => onOpenChange(false)}
              aria-label="关闭分组弹窗"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="border-b p-5 lg:border-r lg:border-b-0">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  分组名称
                </label>
                <Input
                  className="mt-2"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="输入分组名称"
                  disabled={!isEditable}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">分组类型</div>
                <div className="mt-2">
                  <SkillSourceBadge
                    source={state.group?.source}
                    readonly={state.group?.readonly ?? state.mode === "view"}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b p-4">
              <div className="flex items-center gap-2">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索要加入分组的技能"
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {visibleSkills.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border bg-background">
                    {visibleSkills.map((skill) => {
                      const checked = selectedSkillNames.includes(skill.key);
                      return (
                        <label
                          key={skill.key}
                          className={[
                            "grid min-w-0 gap-3 border-b px-4 py-3 last:border-b-0",
                            isEditable ? "cursor-pointer hover:bg-muted/25" : "bg-muted/10",
                            "md:grid-cols-[auto_minmax(0,1fr)_auto]",
                          ].join(" ")}
                        >
                          <Checkbox
                            className="mt-1"
                            checked={checked}
                            disabled={!isEditable}
                            onCheckedChange={(nextChecked) =>
                              toggleSkill(skill.key, nextChecked === true)
                            }
                          />
                          <span className="min-w-0">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate font-mono text-sm font-semibold">
                                {skill.name}
                              </span>
                              <SkillSourceBadge source={skill.source} />
                            </span>
                            <span className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
                              {skillDescriptionPreview(skill.description)}
                            </span>
                            <span className="mt-2 block line-clamp-2 break-words font-mono text-xs leading-5 text-muted-foreground">
                              {skillContentPreview(skill.content)}
                            </span>
                          </span>
                          {checked && (
                            <CheckCircle2 className="mt-1 size-4 text-sidebar-primary" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Search className="size-4" />} text="没有匹配的技能" />
                )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isEditable ? "取消" : "关闭"}
          </Button>
          {isEditable && (
            <Button type="button" onClick={saveGroup}>
              <CheckCircle2 className="size-4" />
              <span>保存分组</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const getDialogTitle = (mode: GroupDialogMode, readonly: boolean) => {
  if (mode === "create") {
    return "新增分组";
  }
  if (mode === "edit" && !readonly) {
    return "编辑分组";
  }
  return "查看分组";
};

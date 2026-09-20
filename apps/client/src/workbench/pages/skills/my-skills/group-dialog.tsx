import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, FolderPlus, Search, Sparkles, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "design-system/components/ui/alert";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { ALL_SKILLS_GROUP_ID, type Skill, type SkillGroup } from "../types";
import { EmptyState } from "./empty-state";
import {
  existingGroupSkillNames,
  filterSkills,
  groupSkillsBySource,
  nextCustomGroupOrder,
  skillDescriptionPreview,
} from "./utils";

type GroupDialogMode = "create" | "view" | "edit";

export type GroupDialogState = {
  open: boolean;
  mode: GroupDialogMode;
  group: SkillGroup | null;
  fallbackName?: string;
  fallbackSkillNames?: string[];
};

type GroupDialogProps = {
  state: GroupDialogState;
  groups: SkillGroup[];
  skills: Skill[];
  skillsByKey: Map<string, Skill>;
  defaultGroupId: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupsChange: (groups: SkillGroup[], defaultGroupId?: string) => void;
  onDefaultGroupChange: (groupId: string) => void;
  onSelectedGroupChange: (groupId: string) => void;
  onDeleteGroup: (group: SkillGroup) => void;
};

export const GroupDialog = ({
  state,
  groups,
  skills,
  skillsByKey,
  defaultGroupId,
  isSaving,
  onOpenChange,
  onGroupsChange,
  onDefaultGroupChange,
  onSelectedGroupChange,
  onDeleteGroup,
}: GroupDialogProps) => {
  const [groupName, setGroupName] = useState("");
  const [isDefaultGroup, setIsDefaultGroup] = useState(false);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const isEditable = state.mode !== "view" && state.group?.readonly !== true;
  const targetGroupId = state.group?.id ?? ALL_SKILLS_GROUP_ID;
  const dialogTitle = getDialogTitle(state.mode, state.group?.readonly === true);
  const visibleSkills = useMemo(() => filterSkills(skills, searchQuery), [skills, searchQuery]);
  const visibleSkillGroups = useMemo(() => groupSkillsBySource(visibleSkills), [visibleSkills]);
  const selectedSkillSet = useMemo(() => new Set(selectedSkillNames), [selectedSkillNames]);
  const canDeleteGroup = state.mode === "edit" && state.group !== null && state.group.readonly !== true;

  useEffect(() => {
    if (!state.open) {
      return;
    }

    if (state.mode === "create") {
      setGroupName("");
      setIsDefaultGroup(false);
      setSelectedSkillNames([]);
    } else {
      setGroupName(state.group?.name ?? state.fallbackName ?? "");
      setIsDefaultGroup(targetGroupId === defaultGroupId);
      setSelectedSkillNames(
        state.group ? existingGroupSkillNames(state.group, skillsByKey) : (state.fallbackSkillNames ?? []),
      );
    }
    setSearchQuery("");
    setCollapsedSources(new Set());
    setError("");
  }, [
    skillsByKey,
    state.fallbackName,
    state.fallbackSkillNames,
    state.group,
    state.mode,
    state.open,
    targetGroupId,
    defaultGroupId,
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

  const toggleSkillGroup = (skillKeys: string[], checked: boolean) => {
    setSelectedSkillNames((current) => {
      const next = new Set(current);
      for (const skillKey of skillKeys) {
        if (checked) {
          next.add(skillKey);
        } else {
          next.delete(skillKey);
        }
      }
      return [...next].sort();
    });
  };

  const toggleSourceCollapse = (source: string) => {
    setCollapsedSources((current) => {
      const next = new Set(current);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const saveGroup = () => {
    if (!isEditable) {
      const nextDefaultGroupId = isDefaultGroup
        ? targetGroupId
        : targetGroupId === defaultGroupId
          ? ALL_SKILLS_GROUP_ID
          : defaultGroupId;
      onDefaultGroupChange(nextDefaultGroupId);
      onOpenChange(false);
      return;
    }

    const name = groupName.trim();
    if (!name) {
      setError("分组名称不能为空");
      return;
    }
    if (selectedSkillNames.length === 0) {
      setError("至少选择一个技能");
      return;
    }
    const duplicated = groups.some((group) => group.id !== state.group?.id && group.name === name);
    if (duplicated) {
      setError("分组名称已存在");
      return;
    }

    const id = state.group?.id ?? `draft-${crypto.randomUUID()}`;
    const nextDefaultGroupId = isDefaultGroup ? id : id === defaultGroupId ? ALL_SKILLS_GROUP_ID : defaultGroupId;
    const nextGroup: SkillGroup = {
      id,
      name,
      description: state.group?.description ?? null,
      source: "custom",
      readonly: false,
      isDefault: id === nextDefaultGroupId,
      order: state.group?.order ?? nextCustomGroupOrder(groups),
      skills: [...selectedSkillNames].sort().map((key) => ({ key })),
    };
    const nextGroups = (
      state.group ? groups.map((group) => (group.id === state.group?.id ? nextGroup : group)) : [...groups, nextGroup]
    ).map((group) => ({
      ...group,
      isDefault: group.id === nextDefaultGroupId,
    }));

    onGroupsChange(nextGroups, nextDefaultGroupId);
    onSelectedGroupChange(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100vh-2rem)] max-h-[760px] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 bg-surface-raised/85 px-5 py-4 pr-14 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <FolderPlus className="size-4" aria-hidden="true" />
                </span>
                {isEditable ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <div className="flex h-10 w-full max-w-[520px] min-w-[220px] flex-1 items-center rounded-xl border border-border/75 bg-card px-3 shadow-xs focus-within:ring-3 focus-within:ring-sidebar-primary/20">
                      <Input
                        id="skill-group-name"
                        aria-label="分组名称"
                        className="h-8 border-0 bg-transparent px-0 text-lg font-semibold tracking-normal shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                        placeholder="输入分组名称"
                        disabled={!isEditable}
                      />
                    </div>
                    <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border/75 bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/55">
                      <Checkbox
                        checked={isDefaultGroup}
                        onCheckedChange={(checked) => setIsDefaultGroup(checked === true)}
                      />
                      <span>默认用于新对话</span>
                    </label>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-lg font-semibold tracking-normal">{groupName || dialogTitle}</span>
                      {targetGroupId === defaultGroupId && (
                        <span className="shrink-0 rounded-full bg-sidebar-primary/10 px-2 py-0.5 text-xs font-medium text-sidebar-primary">
                          默认
                        </span>
                      )}
                    </div>
                    <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border/75 bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/55">
                      <Checkbox
                        checked={isDefaultGroup}
                        onCheckedChange={(checked) => setIsDefaultGroup(checked === true)}
                      />
                      <span>默认用于新对话</span>
                    </label>
                  </div>
                )}
              </div>
              <DialogDescription className="mt-1.5 text-xs leading-5">
                {isEditable
                  ? "从当前技能广场中勾选技能，组成可复用的技能分组。"
                  : "查看这个分组包含的技能，系统分组不可直接修改。"}
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="absolute top-4 right-4 rounded-full"
              onClick={() => onOpenChange(false)}
              aria-label="关闭分组弹窗"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="app-canvas flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
          {error && (
            <Alert variant="destructive" className="shrink-0">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <section className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">选择技能</span>
                <span className="ml-2">
                  已选 {selectedSkillNames.length} 个，共 {skills.length} 个
                </span>
              </div>
              <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-border/75 bg-card px-3 shadow-xs sm:w-[260px]">
                <Search className="size-4 shrink-0 text-muted-foreground/45" />
                <Input
                  className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索技能"
                />
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-1">
                {visibleSkills.length > 0 ? (
                  <div className="space-y-4">
                    {visibleSkillGroups.map((skillGroup) => {
                      const skillKeys = skillGroup.skills.map((skill) => skill.key);
                      const selectedCount = skillKeys.filter((skillKey) => selectedSkillSet.has(skillKey)).length;
                      const allSelected = skillKeys.length > 0 && selectedCount === skillKeys.length;
                      const collapsed = collapsedSources.has(skillGroup.source);

                      return (
                        <section key={skillGroup.source} className="space-y-2">
                          <div className="flex h-8 items-center justify-between px-1">
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-2 rounded-full px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/25"
                              aria-expanded={!collapsed}
                              onClick={() => toggleSourceCollapse(skillGroup.source)}
                            >
                              <ChevronRight
                                className={[
                                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                                  collapsed ? "" : "rotate-90",
                                ].join(" ")}
                              />
                              <span className="text-sm font-semibold text-foreground">{skillGroup.label}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {selectedCount}/{skillKeys.length}
                              </span>
                            </button>
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent/55"
                              disabled={!isEditable || skillKeys.length === 0}
                              onClick={() => toggleSkillGroup(skillKeys, !allSelected)}
                            >
                              {allSelected ? "取消全选" : "全选"}
                            </Button>
                          </div>

                          {!collapsed && (
                            <div className="grid gap-3 md:grid-cols-2">
                              {skillGroup.skills.map((skill) => {
                                const checked = selectedSkillSet.has(skill.key);
                                return (
                                  <button
                                    type="button"
                                    key={skill.key}
                                    disabled={!isEditable}
                                    aria-pressed={checked}
                                    aria-label={`${checked ? "取消选择" : "选择"} ${skill.name}`}
                                    onClick={() => toggleSkill(skill.key, !checked)}
                                    className={[
                                      "group app-interactive-card relative grid min-h-[92px] min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-primary/25",
                                      checked ? "bg-sidebar-primary/[0.04] ring-2 ring-sidebar-primary/45" : "",
                                      isEditable
                                        ? "cursor-pointer transition-[background-color,border-color,box-shadow] motion-reduce:transition-none"
                                        : "cursor-default opacity-80",
                                    ].join(" ")}
                                  >
                                    <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                                      <Sparkles className="size-5" />
                                    </span>

                                    <span className="min-w-0 pr-7">
                                      <span className="flex min-w-0 items-center gap-2">
                                        <span className="min-w-0 truncate font-mono text-[15px] font-semibold tracking-normal">
                                          {skill.name}
                                        </span>
                                      </span>
                                      <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                                        {skillDescriptionPreview(skill.description)}
                                      </span>
                                    </span>

                                    {checked && (
                                      <CheckCircle2 className="pointer-events-none absolute top-3 right-3 size-5 text-sidebar-primary" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </section>
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

        <DialogFooter
          className={[
            "shrink-0 border-t border-border/60 bg-surface-raised/85 px-5 py-4",
            canDeleteGroup ? "sm:justify-between" : "",
          ].join(" ")}
        >
          {canDeleteGroup && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20"
              disabled={isSaving}
              onClick={() => state.group && onDeleteGroup(state.group)}
            >
              <Trash2 className="size-4" />
              <span>删除分组</span>
            </Button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isEditable ? "取消" : "关闭"}
            </Button>
            {(isEditable || isDefaultGroup !== (targetGroupId === defaultGroupId)) && (
              <Button type="button" disabled={isSaving} onClick={saveGroup}>
                <CheckCircle2 className="size-4" />
                <span>{isEditable ? "保存分组" : "保存默认"}</span>
              </Button>
            )}
          </div>
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

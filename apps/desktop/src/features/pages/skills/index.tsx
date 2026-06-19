import { Loader2 } from "lucide-react";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { SkillsPage as SkillsSurface } from "@/features/pages/skills/components/page";
import { useWorkspaceSkills } from "@/features/pages/skills/use-workspace-skills";

const LoadingState = () => (
  <section className="flex h-full min-h-0 items-center justify-center bg-background text-sm text-muted-foreground">
    <div className="flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" />
      <span>正在准备技能配置</span>
    </div>
  </section>
);

export const SkillsPage = () => {
  const { activeWorkspace, defaultWorkspace } = useWorkspaceOverview();
  const workspace = activeWorkspace ?? defaultWorkspace;

  if (!workspace) {
    return <LoadingState />;
  }

  return <SkillsContainer workspaceId={workspace.id} />;
};

const SkillsContainer = ({ workspaceId }: { workspaceId: string }) => {
  const {
    skillsError,
    isSkillsLoading,
    isSkillsSaving,
    isSkillMarketplaceSearching,
    isSkillMarketplaceLoadingMore,
    isSkillInstalling,
    isSkillRemoving,
    defaultSkillGroupId,
    updateSkillGroups,
    updateDefaultSkillGroup,
    searchMarketplace,
    installMarketplaceSkill,
    removeMarketplaceSkill,
  } = useWorkspaceSkills({ workspaceId });

  return (
    <SkillsSurface
      isLoading={isSkillsLoading}
      isSaving={isSkillsSaving}
      isMarketplaceSearching={isSkillMarketplaceSearching}
      isMarketplaceLoadingMore={isSkillMarketplaceLoadingMore}
      isInstalling={isSkillInstalling}
      isRemoving={isSkillRemoving}
      error={skillsError}
      defaultSkillGroupId={defaultSkillGroupId}
      onGroupsChange={updateSkillGroups}
      onDefaultGroupChange={updateDefaultSkillGroup}
      onSearchMarketplace={searchMarketplace}
      onInstallSkill={installMarketplaceSkill}
      onRemoveSkill={removeMarketplaceSkill}
    />
  );
};

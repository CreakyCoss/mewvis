import { SkillsPage as SkillsSurface } from "@/features/pages/skills/components/page";
import { useSkills } from "@/features/pages/skills/use-skills";

export const SkillsPage = () => {
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
  } = useSkills();

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

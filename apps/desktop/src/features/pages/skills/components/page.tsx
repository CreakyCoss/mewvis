import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { InstallSkillInput, RemoveSkillInput, SearchSkillMarketplaceInput, WorkspaceSkillGroup } from "../types";
import { DiscoverSkillsTab } from "./discover";
import { MySkillsTab } from "./my-skills";

type SkillsPageProps = {
  isLoading: boolean;
  isSaving: boolean;
  isMarketplaceSearching: boolean;
  isMarketplaceLoadingMore: boolean;
  isInstalling: boolean;
  isRemoving: boolean;
  error: string;
  defaultSkillGroupId: string;
  onGroupsChange: (groups: WorkspaceSkillGroup[], defaultGroupId?: string) => void;
  onDefaultGroupChange: (groupId: string) => void;
  onSearchMarketplace: (input: SearchSkillMarketplaceInput) => Promise<void>;
  onInstallSkill: (input: InstallSkillInput) => Promise<void>;
  onRemoveSkill: (input: RemoveSkillInput) => Promise<void>;
};

type SkillsTab = "mine" | "discover";

export const SkillsPage = ({
  isLoading,
  isSaving,
  isMarketplaceSearching,
  isMarketplaceLoadingMore,
  isInstalling,
  isRemoving,
  error,
  defaultSkillGroupId,
  onGroupsChange,
  onDefaultGroupChange,
  onSearchMarketplace,
  onInstallSkill,
  onRemoveSkill,
}: SkillsPageProps) => {
  const [activeTab, setActiveTab] = useState<SkillsTab>("mine");

  return (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SkillsTab)}
        className="flex h-full min-h-0 flex-1 flex-col gap-0"
      >
        <header className="app-page-header shrink-0 px-5 pt-6 pb-4 lg:px-8 lg:pt-8">
          <div className="flex min-w-0 items-center gap-8">
            <button
              type="button"
              className={[
                "rounded-md text-2xl font-semibold tracking-[-0.02em] transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                activeTab === "discover" ? "text-foreground" : "text-muted-foreground/55",
              ].join(" ")}
              onClick={() => setActiveTab("discover")}
            >
              探索发现
            </button>
            <button
              type="button"
              className={[
                "rounded-md text-2xl font-semibold tracking-[-0.02em] transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                activeTab === "mine" ? "text-foreground" : "text-muted-foreground/55",
              ].join(" ")}
              onClick={() => setActiveTab("mine")}
            >
              Skill库
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive lg:mx-7">
            {error}
          </div>
        )}

        <TabsContent value="mine" className="min-h-0 flex-1 overflow-hidden">
          <MySkillsTab
            isLoading={isLoading}
            isSaving={isSaving}
            isInstalling={isInstalling}
            isRemoving={isRemoving}
            defaultSkillGroupId={defaultSkillGroupId}
            onGroupsChange={onGroupsChange}
            onDefaultGroupChange={onDefaultGroupChange}
            onInstallSkill={onInstallSkill}
            onRemoveSkill={onRemoveSkill}
          />
        </TabsContent>

        <TabsContent value="discover" className="min-h-0 flex-1 overflow-hidden">
          <DiscoverSkillsTab
            isMarketplaceSearching={isMarketplaceSearching}
            isMarketplaceLoadingMore={isMarketplaceLoadingMore}
            isInstalling={isInstalling}
            onSearchMarketplace={onSearchMarketplace}
            onInstallSkill={onInstallSkill}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
};

import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DiscoverSkillsTab } from "./discover";
import { MySkillsTab } from "./my-skills";

type SkillsTab = "mine" | "discover";

export const SkillsPage = () => {
  const [activeTab, setActiveTab] = useState<SkillsTab>("mine");

  return (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SkillsTab)}
        className="flex h-full min-h-0 flex-1 flex-col gap-0"
      >
        <header className="app-page-header shrink-0 bg-background px-5 pt-6 pb-4 lg:px-8 lg:pt-8">
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

        <TabsContent value="mine" className="min-h-0 flex-1 overflow-hidden">
          <MySkillsTab />
        </TabsContent>

        <TabsContent value="discover" className="min-h-0 flex-1 overflow-hidden">
          <DiscoverSkillsTab />
        </TabsContent>
      </Tabs>
    </section>
  );
};

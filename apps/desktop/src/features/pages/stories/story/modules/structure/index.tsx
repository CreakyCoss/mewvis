import { Activity, BookOpenText, ClipboardCheck, Compass } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StoryProject } from "../../../story-contract";
import { StoryOutlineEditor } from "./outline";
import { StoryPositioningEditor } from "./positioning";
import { StoryTrackingEditor } from "./tracking";
import { StoryCreationRecords } from "./records";
import type { StoryProjectSave } from "./types";

export const StoryStructureModule = ({ project, onSave }: { project: StoryProject; onSave: StoryProjectSave }) => (
  <Tabs defaultValue="positioning" className="gap-4">
    <TabsList variant="line" aria-label="创作结构模块">
      <TabsTrigger value="positioning">
        <Compass className="size-4" />
        作品定位
      </TabsTrigger>
      <TabsTrigger value="outline">
        <BookOpenText className="size-4" />
        大纲
      </TabsTrigger>
      <TabsTrigger value="tracking">
        <Activity className="size-4" />
        连续性
      </TabsTrigger>
      <TabsTrigger value="records">
        <ClipboardCheck className="size-4" />
        创作记录
      </TabsTrigger>
    </TabsList>
    <TabsContent value="positioning">
      <StoryPositioningEditor project={project} onSave={onSave} />
    </TabsContent>
    <TabsContent value="outline">
      <StoryOutlineEditor project={project} onSave={onSave} />
    </TabsContent>
    <TabsContent value="tracking">
      <StoryTrackingEditor project={project} onSave={onSave} />
    </TabsContent>
    <TabsContent value="records">
      <StoryCreationRecords project={project} />
    </TabsContent>
  </Tabs>
);

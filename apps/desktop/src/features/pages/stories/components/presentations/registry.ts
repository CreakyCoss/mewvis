import { chatStoryPresentation } from "./chat";
import {
  type StoryPresentationChannel,
  type StoryPresentationDefinition,
  type StoryPresentationOpenInput,
} from "./shared";
import { tavernStoryPresentation } from "./tavern";

const storyPresentationAdapters = {
  chat: chatStoryPresentation,
  tavern: tavernStoryPresentation,
} satisfies Record<StoryPresentationChannel, {
  definition: StoryPresentationDefinition;
  open: (input: StoryPresentationOpenInput) => void | Promise<void>;
}>;

export const storyPresentationDefinitions: StoryPresentationDefinition[] = Object.values(storyPresentationAdapters)
  .map((adapter) => adapter.definition);

export const openRegisteredStoryPresentation = (
  channel: StoryPresentationChannel,
  input: StoryPresentationOpenInput,
) => storyPresentationAdapters[channel].open(input);

export type {
  StoryPresentationChannel,
  StoryPresentationIcon,
} from "./shared";

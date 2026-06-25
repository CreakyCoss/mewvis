import { chatStoryPresentation } from "./chat";
import {
  type StoryPresentationChannel,
  type StoryPresentationOpenInput,
} from "./shared";
import { tavernStoryPresentation } from "./tavern";

const storyPresentationAdapters = {
  chat: chatStoryPresentation,
  tavern: tavernStoryPresentation,
} satisfies Record<StoryPresentationChannel, {
  open: (input: StoryPresentationOpenInput) => void | Promise<void>;
}>;

export const openRegisteredStoryPresentation = (
  channel: StoryPresentationChannel,
  input: StoryPresentationOpenInput,
) => storyPresentationAdapters[channel].open(input);

export type {
  StoryPresentationChannel,
} from "./shared";

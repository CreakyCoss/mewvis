import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import type { ApplicationStorage } from "@mewvis/app-sdk/data";
import {
  identifier,
  validateProposal,
  type AssistantContext,
  type FilmProposal,
} from "./proposals";
import { newId, validateProject, type FilmProject } from "../model";

export type ProposalIndex = Pick<
  FilmProposal,
  "id" | "projectId" | "episodeId" | "chatId" | "title" | "createdAt"
> & { count: number; dismissed?: boolean };
export const proposalKey = (id: string) => `film:proposal:${identifier(id)}`;
const prefix = "film:proposal:";

/** Full before/after data uses file storage; chat tool results contain only a short proposal reference. */
export function createAssistantStore(
  storage: ApplicationStorage,
  files: ApplicationFileClient,
) {
  let root: Promise<string> | undefined;
  const directory = () =>
    (root ??= files
      .roots()
      .then(async (roots) => {
        const path = `${roots.dataPath.replace(/[\\/]+$/, "")}/film-assistant`;
        await files.mkdir(`${path}/contexts`);
        await files.mkdir(`${path}/proposals`);
        return path;
      })
      .catch((error) => {
        root = undefined;
        throw error;
      }));
  return {
    async prepare(
      project: FilmProject,
      episodeId: string,
      chatId: string,
      requestContext?: string,
    ): Promise<AssistantContext> {
      const visible = requestContext ? JSON.parse(requestContext) : undefined;
      const episode = project.episodes.find((item) => item.id === episodeId);
      const shownScript =
        visible?.project?.episodes?.find(
          (item: { id: string }) => item.id === episodeId,
        )?.script ?? visible?.summary?.script;
      const context = {
        id: newId(),
        chatId: identifier(chatId),
        episodeId: identifier(episodeId),
        project: validateProject(project),
        scriptComplete:
          requestContext === undefined || shownScript === episode?.script,
        ...(visible?.selectedShotId
          ? { selectedShotId: identifier(visible.selectedShotId) }
          : {}),
      };
      if (!context.project.episodes.some((episode) => episode.id === episodeId))
        throw new Error("当前分集已不存在");
      await files.writeText(
        `${await directory()}/contexts/${chatId}.json`,
        JSON.stringify(context),
        { overwrite: true },
      );
      return context;
    },
    async context(
      chatId: string,
      contextId: string,
    ): Promise<AssistantContext> {
      const value = JSON.parse(
        await files.readText(
          `${await directory()}/contexts/${identifier(chatId)}.json`,
          { maxBytes: 20 * 1024 * 1024 },
        ),
      ) as AssistantContext;
      if (
        value.id !== identifier(contextId) ||
        value.chatId !== chatId ||
        typeof value.scriptComplete !== "boolean"
      )
        throw new Error("创作上下文已变化，请使用本轮上下文提交建议");
      return {
        id: value.id,
        chatId,
        episodeId: identifier(value.episodeId),
        project: validateProject(value.project),
        scriptComplete: value.scriptComplete,
        ...(value.selectedShotId
          ? { selectedShotId: identifier(value.selectedShotId) }
          : {}),
      };
    },
    async publish(proposal: FilmProposal) {
      const record = validateProposal(proposal);
      const index: ProposalIndex = {
        id: record.id,
        projectId: record.projectId,
        episodeId: record.episodeId,
        chatId: record.chatId,
        title: record.title,
        createdAt: record.createdAt,
        count: record.changes.length,
      };
      await files.writeText(
        `${await directory()}/proposals/${record.id}.json`,
        JSON.stringify(record),
      );
      await storage.setItem(proposalKey(record.id), index);
      return index;
    },
    async list(
      projectId: string,
      episodeId: string,
      chatId: string,
    ): Promise<ProposalIndex[]> {
      const entries = await storage.keys(),
        result: ProposalIndex[] = [];
      for (const key of entries.filter((key) => key.startsWith(prefix))) {
        const value = await storage.getItem<ProposalIndex>(key);
        if (
          !value ||
          value.projectId !== projectId ||
          value.episodeId !== episodeId ||
          value.chatId !== chatId ||
          value.dismissed
        )
          continue;
        if (
          key !== proposalKey(value.id) ||
          typeof value.title !== "string" ||
          value.title.length > 120 ||
          !Number.isSafeInteger(value.count) ||
          value.count < 1 ||
          !Number.isSafeInteger(value.createdAt)
        )
          throw new Error("创作建议索引无效");
        result.push(value);
      }
      return result.sort((a, b) => b.createdAt - a.createdAt);
    },
    async read(index: ProposalIndex) {
      const record = validateProposal(
        JSON.parse(
          await files.readText(
            `${await directory()}/proposals/${identifier(index.id)}.json`,
            { maxBytes: 20 * 1024 * 1024 },
          ),
        ),
      );
      if (
        record.id !== index.id ||
        record.projectId !== index.projectId ||
        record.episodeId !== index.episodeId ||
        record.chatId !== index.chatId
      )
        throw new Error("创作建议与索引不一致");
      return record;
    },
    async dismiss(index: ProposalIndex) {
      await storage.setItem(proposalKey(index.id), {
        ...index,
        dismissed: true,
      });
    },
  };
}

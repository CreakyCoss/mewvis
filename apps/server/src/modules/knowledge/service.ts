import * as fs from "node:fs/promises";
import { basename, join, extname } from "node:path";
import { KnowledgeRepository } from "./repository.js";
import { KnowledgeIndex } from "./indexer.js";
import { discover } from "./documents.js";
import { root } from "../../infrastructure/filesystem/paths.js";
import {
  invalid,
  nonempty,
  optionalString,
  type JsonObject,
} from "../../shared/validation.js";
import { Serial } from "../../shared/serial.js";

export const knowledgeBare = [
  "list_knowledge_library",
  "get_knowledge_settings",
  "list_embedding_profiles",
  "delete_embedding_profile",
  "get_knowledge_index_status",
  "list_knowledge_collection_files",
  "delete_knowledge_collection",
  "delete_knowledge_source",
];
export class Knowledge {
  private serial = new Serial();
  readonly index: KnowledgeIndex;
  constructor(
    private repo: KnowledgeRepository,
    dataDir: string,
  ) {
    this.index = new KnowledgeIndex(repo, dataDir);
  }
  async saveSettings(i: JsonObject) {
    let dir = optionalString(i.storageDirectory, "storageDirectory");
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
      dir = await root(dir);
    }
    return this.repo.saveSettings(dir ?? null);
  }
  async saveSource(i: JsonObject) {
    const kind = nonempty(i.kind, "kind");
    if (!["file", "directory", "manual"].includes(kind))
      invalid("知识源类型无效");
    let uri = nonempty(i.uri, "uri");
    if (kind !== "manual") {
      uri = await fs.realpath(uri);
      const stat = await fs.stat(uri);
      if (kind === "file" ? !stat.isFile() : !stat.isDirectory())
        invalid("知识源路径类型不匹配");
    }
    const value = this.repo.saveSource(i, uri);
    this.index.stale();
    return value;
  }
  async import(i: JsonObject) {
    return this.serial.run(async () => {
      const directory = await root(this.repo.settings().storageDirectory);
      if (!Array.isArray(i.paths)) invalid("paths 必须是数组");
      const sources = [
        ...new Set(
          await Promise.all(
            i.paths.map((p) => fs.realpath(nonempty(p, "path"))),
          ),
        ),
      ];
      for (const path of sources) {
        const stat = await fs.stat(path);
        if (!stat.isFile() || stat.size > 50 * 1024 * 1024)
          invalid("导入文件无效或超过 50 MiB");
      }
      for (const path of sources) {
        let target = path;
        if (!path.startsWith(directory + "/")) {
          const extension = extname(path),
            stem = basename(path, extension);
          for (let n = 0; n < 10000; n++) {
            target = join(
              directory,
              `${stem}${n ? " (" + n + ")" : ""}${extension}`,
            );
            try {
              await fs.copyFile(path, target, fs.constants.COPYFILE_EXCL);
              break;
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "EEXIST" || n === 9999)
                throw e;
            }
          }
        }
        const existing = this.repo
          .library()
          .sources.find((s) => s.kind === "file" && s.uri === target);
        await this.saveSource({
          id: existing?.id,
          kind: "file",
          uri: target,
          title: basename(target),
          enabled: true,
          metadataJson: '{"imported":true}',
        });
      }
      return this.repo.library();
    });
  }
  commands() {
    const repo = this.repo,
      index = this.index;
    return {
      list_knowledge_library: () => repo.library(),
      get_knowledge_settings: () => repo.settings(),
      list_embedding_profiles: () => repo.profiles(),
      save_embedding_profile: (i: JsonObject) => {
        const v = repo.saveProfile(i);
        index.stale();
        return v;
      },
      delete_embedding_profile: (i: JsonObject) => {
        const v = repo.deleteProfile(i.profileId);
        index.stale();
        return v;
      },
      save_knowledge_settings: (i: JsonObject) => this.saveSettings(i),
      get_knowledge_index_status: (i: JsonObject) =>
        index.status(optionalString(i.collectionId, "collectionId")),
      rebuild_knowledge_index: (i: JsonObject) => index.rebuild(i),
      list_knowledge_collection_files: async (i: JsonObject) =>
        (
          await discover(
            await root(repo.collection(i.collectionId).sourceDirectory),
          )
        ).map(({ path, ...file }) => file),
      save_knowledge_collection: async (i: JsonObject) => {
        const value = repo.saveCollection(i, await root(i.sourceDirectory));
        index.stale();
        return value;
      },
      delete_knowledge_collection: (i: JsonObject) => {
        const v = repo.deleteCollection(i.collectionId);
        index.prune();
        return v;
      },
      save_knowledge_source: (i: JsonObject) => this.saveSource(i),
      import_knowledge_files: (i: JsonObject) => this.import(i),
      delete_knowledge_source: (i: JsonObject) => {
        const v = repo.deleteSource(i.sourceId);
        index.prune();
        return v;
      },
      set_knowledge_collection_sources: (i: JsonObject) => {
        const v = repo.setSources(i);
        index.stale();
        return v;
      },
      set_knowledge_collection_embedding_profile: (i: JsonObject) => {
        const v = repo.setProfile(i);
        index.stale();
        return v;
      },
      search_workspace_knowledge: (i: JsonObject) => index.search(i),
    };
  }
}

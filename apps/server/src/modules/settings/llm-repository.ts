import type { ConfigDatabase } from "../../storage/config/database.js";
import type { LlmProvider, ProviderModel } from "./types.js";

export class LlmRepository {
  constructor(private readonly database: ConfigDatabase) {}

  read(): { providers: LlmProvider[] } {
    const db = this.database.connection;
    const providers = db
      .prepare(
        `SELECT id, name, provider, api_format AS apiFormat,
      api_key AS apiKey, api_endpoint AS apiEndpoint, is_default AS isDefault,
      created_at AS createdAt, updated_at AS updatedAt
      FROM llm_providers ORDER BY is_default DESC, created_at ASC, rowid ASC`,
      )
      .all();
    const models =
      db.prepare(`SELECT id, provider_id AS providerId, model_id AS modelId,
      model_name AS modelName, is_one_million_context AS isOneMillionContext,
      thinking_json AS thinking, created_at AS createdAt, updated_at AS updatedAt
      FROM provider_models WHERE provider_id = ? ORDER BY created_at ASC, rowid ASC`);
    return {
      providers: providers.map(
        (row) =>
          ({
            ...row,
            isDefault: row.isDefault === 1,
            models: models.all(row.id).map(
              (model) =>
                ({
                  ...model,
                  isOneMillionContext: model.isOneMillionContext === 1,
                  thinking:
                    model.thinking === null
                      ? null
                      : JSON.parse(String(model.thinking)),
                }) as unknown as ProviderModel,
            ),
          }) as unknown as LlmProvider,
      ),
    };
  }

  replace(providers: LlmProvider[]) {
    return this.database.transaction(() => {
      const db = this.database.connection;
      db.exec("DELETE FROM llm_providers");
      const providerInsert = db.prepare(`INSERT INTO llm_providers
        (id, name, provider, api_format, api_key, api_endpoint, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const modelInsert = db.prepare(`INSERT INTO provider_models
        (id, provider_id, model_id, model_name, is_one_million_context, thinking_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const p of providers) {
        providerInsert.run(
          p.id,
          p.name,
          p.provider,
          p.apiFormat,
          p.apiKey,
          p.apiEndpoint,
          Number(p.isDefault),
          p.createdAt,
          p.updatedAt,
        );
        for (const m of p.models) {
          modelInsert.run(
            m.id,
            p.id,
            m.modelId,
            m.modelName,
            Number(m.isOneMillionContext),
            m.thinking == null ? null : JSON.stringify(m.thinking),
            m.createdAt,
            m.updatedAt,
          );
        }
      }
      return this.read();
    });
  }
}

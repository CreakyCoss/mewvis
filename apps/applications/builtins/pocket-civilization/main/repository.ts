import { getApplicationDataClient, type ApplicationStorage, type ApplicationStorageValue } from "@mewvis/app-sdk/data";
import { createWorld, validateWorld, type World } from "./model";

export const WORLD_KEY = "pocket:world:v3";
export class WorldRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: ApplicationStorage = getApplicationDataClient().storage) {}
  async load(): Promise<World> {
    const value = await this.storage.getItem(WORLD_KEY);
    if (value !== null) return validateWorld(value);
    const world = createWorld();
    await this.storage.setItem(WORLD_KEY, world as unknown as ApplicationStorageValue);
    return world;
  }
  save(world: World, previousRevision: number): Promise<World> {
    const validated = validateWorld(world);
    const write = this.queue.catch(() => {}).then(async () => {
      const current = await this.storage.getItem(WORLD_KEY);
      if (!current || validateWorld(current).revision !== previousRevision)
        throw new Error("存档已在另一个页面更新，请重新载入小岛后再试。");
      await this.storage.setItem(WORLD_KEY, validated as unknown as ApplicationStorageValue);
      return validated;
    });
    this.queue = write;
    return write;
  }
}

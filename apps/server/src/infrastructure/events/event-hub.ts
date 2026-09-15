import { randomUUID } from "node:crypto";
import { type JsonObject } from "../../shared/validation.js";

export interface ServerEvent {
  id: string;
  name: string;
  payload: JsonObject;
}

/** Bounded, in-memory replay. IDs include an epoch so a server restart cannot look like continuity. */
export class EventHub {
  private readonly epoch = randomUUID();
  private sequence = 0;
  private bytes = 0;
  private readonly history: { event: ServerEvent; bytes: number }[] = [];
  private readonly listeners = new Set<(event: ServerEvent) => void>();

  constructor(
    private readonly maxEvents = 1024,
    private readonly maxBytes = 8 * 1024 * 1024,
  ) {}

  get cursor() {
    return `${this.epoch}:${this.sequence}`;
  }

  publish(name: string, payload: JsonObject) {
    const event = { id: `${this.epoch}:${++this.sequence}`, name, payload };
    const bytes = Buffer.byteLength(JSON.stringify(event));
    this.history.push({ event, bytes });
    this.bytes += bytes;
    while (this.history.length > this.maxEvents || this.bytes > this.maxBytes) {
      this.bytes -= this.history.shift()!.bytes;
    }
    for (const listener of this.listeners) listener(event);
  }

  replay(after?: string): ServerEvent[] | null {
    if (!after || after === this.cursor) return [];
    if (
      after === `${this.epoch}:0` &&
      this.history[0]?.event.id === `${this.epoch}:1`
    )
      return this.history.map(({ event }) => event);
    const index = this.history.findIndex(({ event }) => event.id === after);
    return index === -1
      ? null
      : this.history.slice(index + 1).map(({ event }) => event);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

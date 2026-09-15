export type BackendEvent = { id?: string; name: string; payload: unknown };

/** Streaming UTF-8 decoding and CR/LF framing, including split delimiters. */
export async function readEvents(body: ReadableStream<Uint8Array>, emit: (event: BackendEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let name = "message";
  let id: string | undefined;
  let data: string[] = [];
  const line = (text: string) => {
    if (!text) {
      if (data.length) emit({ id, name, payload: JSON.parse(data.join("\n")) });
      name = "message";
      id = undefined;
      data = [];
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "id" && !value.includes("\0")) id = value;
    else if (field === "data") data.push(value);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.search(/[\r\n]/)) >= 0) {
        if (pending[end] === "\r" && end === pending.length - 1) break;
        const width = pending.slice(end, end + 2) === "\r\n" ? 2 : 1;
        line(pending.slice(0, end));
        pending = pending.slice(end + width);
      }
      if (pending.length + data.reduce((n, s) => n + s.length, 0) > 8 * 1024 * 1024)
        throw new Error("后端事件超过大小限制");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

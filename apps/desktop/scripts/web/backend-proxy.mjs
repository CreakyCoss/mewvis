/** The bearer token stays in this local process; Vite never embeds it in client code. */
export function webBackendConfig(url, token) {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") throw new Error("Node 服务必须监听本机回环地址");
  const guard = (server) => {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith("/api/")) return next();
      let valid = false;
      try {
        const source = new URL(`http://${request.headers.host}`);
        valid =
          ["localhost", "127.0.0.1", "[::1]"].includes(source.hostname) &&
          Number(source.port || 80) === request.socket.localPort &&
          (!request.headers.origin || request.headers.origin === source.origin) &&
          !["cross-site", "same-site"].includes(request.headers["sec-fetch-site"]);
      } catch {
        /* Invalid Host. */
      }
      if (!valid) {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { code: "INVALID_ORIGIN", message: "不允许此来源访问本地服务" } }));
        return;
      }
      next();
    });
  };
  const proxy = {
    "/api/": {
      target: target.origin,
      changeOrigin: true,
      configure(proxy) {
        proxy.on("proxyReq", (request, _incoming, response) => {
          response.once("close", () => {
            if (!response.writableEnded) request.destroy();
          });
          request.setHeader("authorization", `Bearer ${token}`);
          request.setHeader("origin", target.origin);
        });
      },
    },
  };
  return {
    plugins: [{ name: "isle-local-backend", configureServer: guard, configurePreviewServer: guard }],
    server: { host: "127.0.0.1", proxy },
    preview: { host: "127.0.0.1", proxy },
  };
}

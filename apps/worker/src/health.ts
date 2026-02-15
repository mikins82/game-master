// ---------------------------------------------------------------------------
// Minimal HTTP health-check server for the worker service.
// Docker / load-balancers can probe GET /health to verify liveness.
// ---------------------------------------------------------------------------

import http from "node:http";

export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "worker" }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, "0.0.0.0", () => {
    // logged at the call site
  });

  return server;
}

// Jednoduchý statický server pro testy (bez závislostí).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

export function serve(root, port = 0) {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = normalize(join(root, p));
    if (!f.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
    try { const b = await readFile(f); res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }).end(b); }
    catch { res.writeHead(404).end("not found"); }
  });
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() })));
}

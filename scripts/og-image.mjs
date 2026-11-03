// Vygeneruje og.png (1200×630, náhled pro sociální sítě) a apple-touch-icon.png z aktuální homepage.
// Spuštění: node scripts/og-image.mjs  (vyžaduje balíček playwright, viz package.json)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve } from "../tests/server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srv = await serve(root);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.addInitScript(() => { try { localStorage.setItem("kzb-consent", "necessary"); } catch (e) {} });
await p.goto(srv.url + "#prehled");
await p.waitForTimeout(1500);
await p.screenshot({ path: join(root, "og.png") });
const q = await b.newPage({ viewport: { width: 180, height: 180 } });
await q.goto(srv.url + "index.html");
await q.setContent(`<style>html,body{margin:0;background:#0a0a0a}</style><img src="${srv.url}favicon.svg" width="180" height="180">`);
await q.waitForTimeout(200);
await q.screenshot({ path: join(root, "apple-touch-icon.png") });
await b.close();
srv.close();
console.log("og.png a apple-touch-icon.png vygenerovány");

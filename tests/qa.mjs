// Kontrola webu v prohlížeči: všechny routy na 1280 a 390 px.
// Hlásí chyby v konzoli, NaN/undefined/null/Infinity v textu, vodorovný scroll a požadavky mimo web.
// Spuštění: node tests/qa.mjs  (vyžaduje balíček playwright)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve } from "./server.mjs";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = ["prehled", "banky", "sazby", "dane", "dividendy", "mzdy", "propousteni", "metodika", "onas", "soukromi", "podminky", "cs", "csob", "kb", "ucb", "rb", "moneta", "fio"];
const WIDTHS = [1280, 390];
const FIXTURE = join(root, "tests/fixtures/data-live.sample.js");
// 1. průchod: skutečný data-live.js, 2. průchod: vyplněný testovací vzorek živých dat
const PASSES = [{ name: "", live: null }, { name: " vzorek", live: FIXTURE }];
const BAD = /\b(NaN|undefined|null|Infinity)\b/;

const srv = await serve(root);
const browser = await chromium.launch();
const problems = [];
for (const pass of PASSES) for (const w0 of WIDTHS) {
  const w = w0 + pass.name;
  const ctx = await browser.newContext({ viewport: { width: w0, height: 900 } });
  const page = await ctx.newPage();
  if (pass.live) await page.route("**/data-live.js", (r) => r.fulfill({ path: pass.live, contentType: "text/javascript" }));
  let route = "";
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`[${w}px #${route}] konzole ${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[${w}px #${route}] chyba JS: ${e.message}`));
  page.on("request", (r) => { if (!r.url().startsWith(srv.url) && !r.url().startsWith("data:")) problems.push(`[${w}px #${route}] požadavek mimo web: ${r.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`[${w}px #${route}] HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(srv.url + "#prehled", { waitUntil: "load" });
  for (const r of ROUTES) {
    route = r;
    await page.evaluate((h) => { location.hash = h; }, r);
    await page.waitForTimeout(150);
    if (pass.live && (r === "prehled" || r === "kb")) {
      const cards = await page.evaluate((r) => ({ news: document.querySelectorAll(r === "prehled" ? ".hot-kpi .hk-lead, .hot-kpi .hk li" : "ul.news li").length, txt: document.body.innerText }), r);
      if (!cards.news) problems.push(`[${w}px #${r}] karta zpráv je prázdná`);
      if (r === "prehled" && !/Hodnocení bankovních aplikací/.test(cards.txt)) problems.push(`[${w}px #${r}] chybí karta aplikací`);
      if (!/Hot news|Změny ve vedení/.test(cards.txt) || (r === "prehled" && /Index férovosti|Jak banky vydělávají na úrocích/.test(cards.txt)) || (r === "kb" && !/Testovací Osoba B/.test(cards.txt))) problems.push(`[${w}px #${r}] chybí hot news / změny ve vedení`);
    }
    const res = await page.evaluate(() => {
      const t = document.body.innerText;
      const docW = document.documentElement.scrollWidth, vw = document.documentElement.clientWidth;
      const empty = !document.getElementById("app").innerText.trim();
      return { bad: (t.match(/.{0,40}\b(NaN|undefined|null|Infinity)\b.{0,40}/g) || []), scroll: docW > vw ? docW - vw : 0, empty };
    });
    if (res.empty) problems.push(`[${w}px #${r}] prázdná stránka`);
    for (const b of res.bad) if (BAD.test(b)) problems.push(`[${w}px #${r}] v textu: …${b.trim()}…`);
    if (res.scroll) problems.push(`[${w}px #${r}] vodorovný scroll o ${res.scroll} px`);
  }
  await ctx.close();
}
// Měření návštěvnosti: bez souhlasu žádný požadavek ven (kontrolují průchody výše), se souhlasem jen GoatCounter
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("kzb-consent", "all"); } catch (e) {} });
  const page = await ctx.newPage();
  const ext = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => { ext.push(r.request().url()); r.abort(); });
  await page.goto(srv.url + "#prehled", { waitUntil: "load" });
  await page.waitForTimeout(300);
  if (!ext.some((u) => u.startsWith("https://gc.zgo.at/count.js"))) problems.push("[souhlas] měření návštěvnosti se po souhlasu nenačetlo");
  for (const u of ext) if (!u.startsWith("https://gc.zgo.at/")) problems.push(`[souhlas] požadavek mimo web: ${u}`);
  await ctx.close();
}
await browser.close();
srv.close();
if (problems.length) { console.error(problems.join("\n")); console.error(`\n✗ ${problems.length} problémů`); process.exit(1); }
console.log(`✓ ${ROUTES.length} rout × ${WIDTHS.length} šířky × ${PASSES.length} sady dat bez chyb`);

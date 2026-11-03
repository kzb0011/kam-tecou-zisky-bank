// Kontrola, že repozitář neobsahuje zakázané řetězce (jména, e-maily, odkazy na nástroje, třetí strany).
// Spuštění: node tests/forbidden.mjs
// Vlastní jména k hlídání: proměnná FORBIDDEN_NAMES="jmeno1,jmeno2" nebo soubor .forbidden (jeden výraz na řádek, je v .gitignore).
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (c) => execSync(c, { cwd: root, encoding: "utf8" });
// Výchozí seznam je zakódovaný, aby se hledané výrazy nevyskytovaly v repozitáři samy.
const BASE = Buffer.from("Y2xhdWRlfGFudGhyb3BpY3xnb29nbGVhcGlzfGNvLWF1dGhvcmVkLWJ5fGdlbmVyYXRlZCB3aXRofGNoYXRncHR8b3BlbmFpfGNvcGlsb3R8Z2VtaW5p", "base64").toString().split("|");
const own = [...(process.env.FORBIDDEN_NAMES || "").split(","), ...(existsSync(join(root, ".forbidden")) ? readFileSync(join(root, ".forbidden"), "utf8").split(/\r?\n/) : [])].map((s) => s.trim()).filter(Boolean);
const THIRD = [BASE[2], "fonts.gstatic", "cdnjs.", "jsdelivr", "unpkg.com", "googletagmanager", "google-analytics"];

const ctx = { window: {} };
vm.runInNewContext(readFileSync(join(root, "data.js"), "utf8"), ctx);
const KONTAKT = String(ctx.window.BANK_DATA.kontakt || "").toLowerCase();
const OK_MAIL = new Set([KONTAKT, "41898282+github-actions[bot]@users.noreply.github.com"].filter(Boolean));
const MAIL_RE = /[a-z0-9._%+\-[\]]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const files = sh("git ls-files --cached --others --exclude-standard").split("\n").filter(Boolean)
  .filter((f) => !f.startsWith("fonts/") && !/\.(png|jpe?g|woff2?|ico)$/i.test(f) && existsSync(join(root, f)));
const hits = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const f of files) {
  const t = readFileSync(join(root, f), "utf8").toLowerCase();
  const live = f === "data-live.js"; // titulky zpráv mohou zmínit cokoli, kontrolují se jen e-maily a třetí strany
  const words = live ? own : [...BASE, ...own];
  for (const w of words) if (new RegExp(`\\b${esc(w.toLowerCase())}`).test(t)) hits.push(`${f}: obsahuje „${w}“`);
  if (/\.(html|css|js)$/.test(f) && !f.startsWith("scripts/") && !f.startsWith("tests/") && !live) for (const w of THIRD) if (t.includes(w)) hits.push(`${f}: odkaz na třetí stranu „${w}“`);
  for (const m of t.match(MAIL_RE) || []) if (!OK_MAIL.has(m) && !/@(example\.|localhost)/.test(m)) hits.push(`${f}: e-mail ${m}`);
}
// historie gitu: autoři, commiteři a zprávy commitů
let log = "";
try { log = sh("git log --all --format='%an <%ae>|%cn <%ce>|%B'"); } catch {}
const okAuthor = (s) => /^(kzb0011|github-actions\[bot\]) <[^>]*@users\.noreply\.github\.com>$/.test(s);
for (const c of log.split("\n").filter(Boolean)) {
  const [a, cm] = c.split("|");
  if (a && cm !== undefined && (!okAuthor(a) || !okAuthor(cm))) hits.push(`git: nepovolená identita ${a} / ${cm}`);
  const low = c.toLowerCase();
  for (const w of [...BASE, ...own]) if (low.includes(w.toLowerCase())) hits.push(`git: zpráva commitu obsahuje „${w}“`);
}

// PDF a podklady do repozitáře nepatří
for (const f of sh("git ls-files").split("\n").filter(Boolean)) if (/\.pdf$/i.test(f) || f.startsWith("podklady/")) hits.push(`${f}: soubor nemá být v repozitáři`);

const uniq = [...new Set(hits)];
if (uniq.length) { console.error(uniq.join("\n") + `\n✗ ${uniq.length} nálezů`); process.exit(1); }
console.log(`✓ ${files.length} souborů a historie gitu bez zakázaných řetězců`);

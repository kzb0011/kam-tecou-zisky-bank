// Validace data.js (a data-live.js, pokud je vyplněný). Spuštění: node tests/validate-data.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(join(root, f), "utf8"), ctx); return ctx.window; };
const D = load("data.js").BANK_DATA;
const L = load("data-live.js").LIVE_DATA;
const err = [];
const num = (x) => typeof x === "number" && Number.isFinite(x);
const YEARS = Array.from({ length: 10 }, (_, i) => String(2016 + i));
const URL_RE = /^https?:\/\/\S+$/;

if (!D || !Array.isArray(D.banky)) err.push("data.js: chybí window.BANK_DATA.banky");
const ids = new Set();
for (const b of D.banky || []) {
  const p = `banka ${b.id}`;
  if (ids.has(b.id)) err.push(`${p}: duplicitní id`); ids.add(b.id);
  for (const k of ["id", "nazev", "zkratka", "kapital"]) if (!b[k]) err.push(`${p}: chybí ${k}`);
  for (const y of YEARS) if (!num(b.zisk?.[y])) err.push(`${p}: zisk ${y} chybí nebo není číslo`);
  if (b.podil_zahranici !== null && b.podil_zahranici !== undefined && !(num(b.podil_zahranici) && b.podil_zahranici >= 0 && b.podil_zahranici <= 1)) err.push(`${p}: podil_zahranici mimo 0–1`);
  let sum = 0, n = 0;
  for (const d of b.dividendy || []) {
    if (!(num(d.mld) && d.mld > 0)) err.push(`${p}: dividenda ze zisku ${d.ze_zisku} není kladné číslo`);
    if (!d.zdroj || !URL_RE.test(d.zdroj)) err.push(`${p}: dividenda ze zisku ${d.ze_zisku} nemá zdroj`);
    sum += d.mld; n++;
  }
  for (const d of b.dps || []) {
    if (!(num(d.kc) && d.kc >= 0)) err.push(`${p}: dps ${d.ze_zisku} není číslo ≥ 0`);
    if (!(num(b.akcie) && b.akcie > 0)) err.push(`${p}: dps bez počtu akcií`);
    sum += (d.kc * b.akcie) / 1e9; n++;
  }
  if (n && !(num(sum) && sum > 0)) err.push(`${p}: součet dividend ${sum} není kladné číslo`);
  for (const k of ["dan", "zamestnanci", "pobocky"]) for (const [y, v] of Object.entries(b[k] || {})) if (v !== null && !num(v)) err.push(`${p}: ${k} ${y} není číslo`);
  if (b.board && b.board.total_typ === "odhad" && !b.board.pozn) err.push(`${p}: odhad odměn bez vysvětlení (pozn)`);
}
for (const r of D.sektor?.index?.rady || []) {
  if (!/^\d{2}\/\d{2}$/.test(r[0]) || !r.slice(1).every(num)) err.push(`sektor.index.rady: špatný řádek ${JSON.stringify(r)}`);
}
for (const k of ["vklady", "uvery"]) for (const r of D.sektor?.sazby?.[k] || []) if (!num(r[1])) err.push(`sektor.sazby.${k}: ${r[0]} není číslo`);

if (L && L.aktualizace) {
  for (const z of L.zpravy || []) if (!z.title || !URL_RE.test(z.url || "") || isNaN(new Date(z.date))) err.push(`data-live: vadná zpráva ${JSON.stringify(z).slice(0, 80)}`);
  for (const [id, a] of Object.entries(L.aplikace || {})) if (!ids.has(id) || !num(a.rating) || a.rating < 1 || a.rating > 5 || !num(a.count)) err.push(`data-live: vadná aplikace ${id}`);
}

if (err.length) { console.error(err.join("\n") + `\n✗ ${err.length} chyb v datech`); process.exit(1); }
console.log(`✓ data.js v pořádku (${D.banky.length} bank)`);

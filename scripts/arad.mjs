// Měsíční aktualizace úrokových sazeb a indexu férovosti z ČNB ARAD + 2T repo sazba ČNB.
// Spouští GitHub Actions (.github/workflows/rates.yml). Bez závislostí, Node 20+.
// API klíč: proměnná CNB_ARAD_KEY (GitHub Secret). Bez klíče skript jen vypíše varování a nic nemění.
// Kódy ukazatelů jsou v scripts/arad-config.json. Dokud nejsou všechny vyplněné, data.js se nemění.
// Volby: --dry  (nic nezapíše, jen vypíše, co by změnil)
import { readFile, writeFile } from "node:fs/promises";

const API = "https://www.cnb.cz/aradb/api/v1/data";
const REPO_URL = "https://www.cnb.cz/cs/casto-kladene-dotazy/.galleries/vyvoj_repo_historie.txt";
const DATA = new URL("../data.js", import.meta.url);
const CONFIG = new URL("./arad-config.json", import.meta.url);
const MESICE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
// pořadí a popisky odpovídají sektor.sazby a sektor.ferovost v data.js
export const SERIES = {
  bezny: "Běžný účet",
  na_pozadani: "Vklady na požádání (vč. spořicích účtů)",
  terminovane: "Termínovaný vklad",
  hypoteky: "Nová hypotéka",
  spotrebitelske: "Spotřebitelský úvěr",
  kontokorent: "Kontokorent",
  karty: "Kreditní karta",
};

// Odpověď ARAD je CSV (oddělovač ; nebo ,). Hledá sloupce s kódem ukazatele, obdobím a hodnotou.
export function parseArad(csv) {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim().toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const ci = col(/indicator|ukazatel/), cp = col(/period|obdob|date|datum/), cv = col(/value|hodnota/);
  if (ci < 0 || cp < 0 || cv < 0) throw new Error(`neznámé sloupce: ${head.join(" | ")}`);
  return lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.replace(/"/g, "").trim());
    return { id: c[ci], period: normPeriod(c[cp]), value: parseFloat((c[cv] || "").replace(/\s/g, "").replace(",", ".")) };
  }).filter((r) => r.id && r.period && Number.isFinite(r.value));
}
// "20260831", "2026-08-31", "31.08.2026", "2026-08", "08/2026" → "2026-08"
export function normPeriod(s) {
  let m = String(s).match(/^(\d{4})-?(\d{2})(-?\d{2})?$/); if (m) return `${m[1]}-${m[2]}`;
  m = String(s).match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}`;
  m = String(s).match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return null;
}
// repo sazba platná většinu měsíce (stejné pravidlo jako v Metodice)
export function repoForMonth(rows, ym) {
  const [y, mo] = ym.split("-").map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const tally = new Map();
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (let d = 1; d <= days; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`;
    const r = sorted.filter((x) => x.date <= iso).pop();
    if (r) tally.set(r.rate, (tally.get(r.rate) || 0) + 1);
  }
  let best = null; for (const [rate, n] of tally) if (!best || n > best.n) best = { rate, n };
  return best ? best.rate : null;
}
export function parseRepoAll(txt) {
  const rows = [];
  for (const line of txt.split(/\r?\n/)) {
    let m = line.match(/(\d{4})(\d{2})(\d{2})\D+(\d+[.,]\d+)/);
    if (m) { rows.push({ date: `${m[1]}-${m[2]}-${m[3]}`, rate: parseFloat(m[4].replace(",", ".")) }); continue; }
    m = line.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\D+(\d+[.,]\d+)/);
    if (m) rows.push({ date: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, rate: parseFloat(m[4].replace(",", ".")) });
  }
  return rows;
}
const label = (ym) => `${MESICE[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
const short = (ym) => `${ym.slice(5)}/${ym.slice(2, 4)}`;
const r2 = (x) => Math.round(x * 100) / 100;

// Zapracuje hodnoty za měsíc ym do objektu BANK_DATA. Vrací seznam změn.
export function apply(D, ym, v, repo, zdroj) {
  const ch = [];
  const S = D.sektor, F = S.ferovost;
  const set = (arr, k, val) => { const r = arr.find((x) => x[0] === k); if (r && r[1] !== val) { ch.push(`${k}: ${r[1]} → ${val}`); r[1] = val; } };
  for (const k of ["bezny", "na_pozadani", "terminovane"]) set(S.sazby.vklady, SERIES[k], v[k]);
  for (const k of ["hypoteky", "spotrebitelske", "kontokorent", "karty"]) set(S.sazby.uvery, SERIES[k], v[k]);
  S.sazby.obdobi = label(ym); S.sazby.zdroj = zdroj;
  const fr = { "Vklady na požádání": v.na_pozadani, "Termínovaný vklad": v.terminovane, "Nová hypotéka": v.hypoteky, "Spotřebitelský úvěr": v.spotrebitelske };
  for (const r of F.radky) if (r.k in fr && r.cz !== fr[r.k]) { ch.push(`férovost ${r.k}: ${r.cz} → ${fr[r.k]}`); r.cz = fr[r.k]; }
  for (const r of F.jen_cz || []) { const k = { "Běžný účet": "bezny", "Kontokorent": "kontokorent", "Kreditní karta": "karty" }[r[0]]; if (k && r[1] !== v[k]) r[1] = v[k]; }
  if (F.cz_banka !== repo) { ch.push(`repo: ${F.cz_banka} → ${repo}`); F.cz_banka = repo; }
  // Sazby eurozóny (ECB) mají jiný zdroj a datum. Při posunu měsíce zůstávají, proto se v poznámce uvádí jejich období.
  if (F.obdobi !== label(ym)) { F.ea_obdobi = F.ea_obdobi || F.obdobi; F.obdobi = label(ym); }
  F.zdroje.cz = zdroj;
  const rady = S.index.rady, key = short(ym);
  const row = [key, repo, v.na_pozadani, v.bezny, v.hypoteky];
  const i = rady.findIndex((r) => r[0] === key);
  if (i >= 0) { if (JSON.stringify(rady[i]) !== JSON.stringify(row)) { rady[i] = row; ch.push(`index ${key} opraven`); } }
  else { rady.push(row); ch.push(`index: nový řádek ${JSON.stringify(row)}`); }
  rady.sort((a, b) => (a[0].slice(3) + a[0].slice(0, 2)).localeCompare(b[0].slice(3) + b[0].slice(0, 2)));
  return ch;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const key = process.env.CNB_ARAD_KEY;
  if (!key) { console.warn("::warning::Chybí CNB_ARAD_KEY (GitHub Secret). Sazby se neaktualizují."); return; }
  const cfg = JSON.parse(await readFile(CONFIG, "utf8"));
  const ids = Object.fromEntries(Object.keys(SERIES).map((k) => [k, cfg.indicators?.[k] || null]));
  const missing = Object.keys(ids).filter((k) => !ids[k]);
  const q = new URLSearchParams({ api_key: key, lang: "CZ", period_from: cfg.period_from || "" });
  if (cfg.selection_id) q.set("selection_id", cfg.selection_id);
  else if (missing.length < Object.keys(ids).length) q.set("indicator_id_list", Object.values(ids).filter(Boolean).join(","));
  else { console.warn("::warning::V scripts/arad-config.json nejsou kódy ukazatelů ani selection_id. Nic se nemění."); return; }
  for (const [k, v] of [...q]) if (!v) q.delete(k);

  const res = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  if (!res.ok) { console.warn(`::warning::ARAD HTTP ${res.status}: ${body.slice(0, 300).replace(key, "***")}`); return; }
  let rows;
  try { rows = parseArad(body); } catch (e) { console.warn(`::warning::ARAD: ${e.message}`); console.log(body.slice(0, 800)); return; }
  const found = [...new Set(rows.map((r) => r.id))];
  console.log(`ARAD: ${rows.length} hodnot, ukazatele: ${found.join(", ")}`);
  if (missing.length) {
    console.warn(`::warning::Chybí kódy ukazatelů pro: ${missing.join(", ")}. Ukázka dat pro doplnění:`);
    for (const id of found) console.log(id, rows.filter((r) => r.id === id).slice(-3).map((r) => `${r.period}=${r.value}`).join(" "));
    return;
  }
  // poslední měsíc, za který jsou všechny řady
  const months = [...new Set(rows.map((r) => r.period))].sort().reverse();
  const ym = months.find((m) => Object.values(ids).every((id) => rows.some((r) => r.id === id && r.period === m)));
  if (!ym) { console.warn("::warning::ARAD: žádný měsíc nemá všechny řady."); return; }
  const v = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, r2(rows.find((r) => r.id === id && r.period === ym).value)]));
  for (const [k, x] of Object.entries(v)) if (!(x >= 0 && x < 40)) { console.warn(`::warning::Podezřelá hodnota ${k}=${x}, nic se nemění.`); return; }

  let repo;
  try { const rr = parseRepoAll(await (await fetch(REPO_URL, { signal: AbortSignal.timeout(20000) })).text()); repo = repoForMonth(rr, ym); } catch (e) { console.warn(`repo: ${e.message}`); }
  if (repo == null) { console.warn("::warning::Repo sazbu za měsíc se nepodařilo zjistit, nic se nemění."); return; }

  const t = await readFile(DATA, "utf8");
  const D = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  const ch = apply(D, ym, v, repo, cfg.zdroj || "https://www.cnb.cz/aradb/");
  if (!ch.length) { console.log(`Bez změn (${label(ym)}).`); return; }
  console.log(`Změny za ${label(ym)}:\n - ${ch.join("\n - ")}`);
  if (dry) return;
  await writeFile(DATA, t.slice(0, t.indexOf("{")) + JSON.stringify(D, null, 1) + t.slice(t.lastIndexOf("}") + 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.warn(`::warning::ARAD: ${e.message}`); });

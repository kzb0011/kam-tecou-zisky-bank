// Denní aktualizace živých dat: zprávy o bankách, hodnocení aplikací, repo sazba ČNB.
// Spouští GitHub Actions (viz .github/workflows/update.yml). Bez závislostí, Node 20+.
// Když některý zdroj selže, zůstanou v data-live.js jeho poslední platná data a skript nespadne.
import { readFile, writeFile } from "node:fs/promises";

// trackId: když je vyplněné, aplikace se načte přímo (iTunes lookup) a hledání se nepoužije.
// Párování se kontroluje v logu běhu („app …“). Při chybném párování sem doplň správné trackId.
export const BANKS = [
  { id: "cs", q: '"Česká spořitelna"', app: { term: "George Česko", seller: /spořitelna|erste/i, trackId: null } },
  { id: "csob", q: '"ČSOB" banka', app: { term: "ČSOB Smart", seller: /obchodn|ČSOB|CSOB/i, trackId: null } },
  { id: "kb", q: '"Komerční banka"', app: { term: "KB+ Komerční banka", seller: /komer/i, trackId: null } },
  { id: "ucb", q: '"UniCredit Bank" Česko', app: { term: "UniCredit Smart Banking", seller: /unicredit/i, trackId: null } },
  { id: "rb", q: '"Raiffeisenbank" Česko', app: { term: "Raiffeisenbank", seller: /raiffeisen/i, trackId: null } },
  { id: "moneta", q: '"Moneta Money Bank"', app: { term: "Smart Banka MONETA", seller: /moneta/i, trackId: null } },
  { id: "fio", q: '"Fio banka"', app: { term: "Fio Smartbanking", seller: /fio/i, trackId: null } },
];
// vedlejší aplikace (klíče, firemní, pojišťovny…) se nepárují
const SIDE_APP = /klíč|klic|\bkey\b|token|business|podnik|firm|pojiš|leasing|stavební|penzi|invest|trader|wallet|pay\b/i;
const OUT = new URL("../data-live.js", import.meta.url);
const UA = { "user-agent": "Mozilla/5.0 (compatible; kzb-data/1.0)" };
const DAY = 864e5;
const NEWS_DAYS = 30, NEWS_PER_BANK = 15, NEWS_MAX = 80, HIST_DAYS = 90;

const decode = (s) => s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };
export const normTitle = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function parseNews(xml, bankId, now = Date.now()) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((it) => {
    const source = tag(it, "source");
    let title = tag(it, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const d = new Date(tag(it, "pubDate"));
    return { bank: bankId, title, url: tag(it, "link"), source, date: isNaN(d) ? null : d.toISOString() };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url) && x.date && now - new Date(x.date) <= NEWS_DAYS * DAY && new Date(x.date) - now < DAY);
}

export function mergeNews(lists, now = Date.now()) {
  const seen = new Set(), out = [];
  for (const n of lists.flat().sort((a, b) => b.date.localeCompare(a.date))) {
    if (now - new Date(n.date) > NEWS_DAYS * DAY) continue;
    const k = normTitle(n.title);
    if (seen.has(k) || seen.has(n.url)) continue;
    seen.add(k); seen.add(n.url); out.push(n);
  }
  return out.slice(0, NEWS_MAX);
}

export function pickApp(results, seller) {
  const c = (results || []).filter((r) => seller.test(r.sellerName || r.artistName || "") && !SIDE_APP.test(r.trackName || "") && r.userRatingCount > 0);
  c.sort((a, b) => b.userRatingCount - a.userRatingCount);
  return c[0] ? toApp(c[0]) : null;
}
const toApp = (r) => ({ name: r.trackName, seller: r.sellerName || r.artistName || "", rating: Math.round(r.averageUserRating * 100) / 100, count: r.userRatingCount, url: r.trackViewUrl, id: r.trackId });

export function addHistory(prev, app, day) {
  const h = ((prev && prev.historie) || []).filter((x) => x.d !== day && (new Date(day) - new Date(x.d)) / DAY < HIST_DAYS);
  return h.concat([{ d: day, r: app.rating, n: app.count }]);
}

export function parseRepo(txt) {
  // akceptuje řádky typu "20250509|3,50" nebo "9.5.2025 3.50"
  const rows = [];
  for (const line of txt.split(/\r?\n/)) {
    let m = line.match(/(\d{4})(\d{2})(\d{2})\D+(\d+[.,]\d+)/);
    if (m) { rows.push({ date: `${m[1]}-${m[2]}-${m[3]}`, rate: parseFloat(m[4].replace(",", ".")) }); continue; }
    m = line.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\D+(\d+[.,]\d+)/);
    if (m) rows.push({ date: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, rate: parseFloat(m[4].replace(",", ".")) });
  }
  const ok = rows.filter((r) => r.rate >= 0 && r.rate < 30);
  ok.sort((a, b) => a.date.localeCompare(b.date));
  return ok.length ? ok[ok.length - 1] : null;
}

async function get(url, type = "text") {
  const ctl = AbortSignal.timeout(20000);
  const r = await fetch(url, { headers: UA, signal: ctl });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return type === "json" ? r.json() : r.text();
}

export async function readOld(file = OUT) {
  try { const t = await readFile(file, "utf8"); return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { return {}; }
}

async function main() {
  const old = await readOld();
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const oldNews = old.zpravy || [];
  const out = { aktualizace: now.toISOString(), zpravy: [], aplikace: { ...(old.aplikace || {}) }, repo: old.repo || null, stav: {} };
  const lists = [];
  let okNews = 0, okApps = 0;
  for (const b of BANKS) {
    try {
      const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(b.q + " when:30d")}&hl=cs&gl=CZ&ceid=CZ:cs`);
      const n = parseNews(xml, b.id).slice(0, NEWS_PER_BANK);
      lists.push(n); okNews++;
      console.log(`news ${b.id}: ${n.length}`);
    } catch (e) {
      lists.push(oldNews.filter((x) => x.bank === b.id)); // výpadek: nech staré zprávy této banky
      console.warn(`news ${b.id}: CHYBA ${e.message}, ponechána stará data`);
    }
    try {
      const a = b.app.trackId
        ? (await get(`https://itunes.apple.com/lookup?id=${b.app.trackId}&country=cz`, "json")).results?.map(toApp)[0]
        : pickApp((await get(`https://itunes.apple.com/search?term=${encodeURIComponent(b.app.term)}&country=cz&entity=software&limit=50`, "json")).results, b.app.seller);
      if (!a) throw new Error("aplikace nenalezena");
      a.historie = addHistory(out.aplikace[b.id], a, day);
      out.aplikace[b.id] = a; okApps++;
      console.log(`app ${b.id}: ${a.name} | prodejce ${a.seller} | trackId ${a.id} | ${a.rating} ★ (${a.count})`);
    } catch (e) { console.warn(`app ${b.id}: CHYBA ${e.message}, ponechána stará data`); }
  }
  out.zpravy = mergeNews(lists, now.getTime());
  let okRepo = false;
  try {
    const r = parseRepo(await get("https://www.cnb.cz/cs/casto-kladene-dotazy/.galleries/vyvoj_repo_historie.txt"));
    if (!r) throw new Error("nepodařilo se přečíst");
    out.repo = r; okRepo = true;
    console.log(`repo: ${r.rate} % od ${r.date}`);
  } catch (e) { console.warn(`repo: CHYBA ${e.message}, ponechána stará hodnota`); }
  out.stav = { zpravy: `${okNews}/${BANKS.length}`, aplikace: `${okApps}/${BANKS.length}`, repo: okRepo };
  if (!okNews && !okApps && !okRepo) { console.warn("Všechny zdroje selhaly, data-live.js zůstává beze změny."); return; }
  await writeFile(OUT, "window.LIVE_DATA = " + JSON.stringify(out, null, 1) + ";\n");
  console.log(`hotovo: zprávy ${out.zpravy.length}, aplikace ${Object.keys(out.aplikace).length}, repo ${out.repo ? out.repo.rate : "–"}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.warn("Neočekávaná chyba:", e.message); });

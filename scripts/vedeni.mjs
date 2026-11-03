// Složení vedení bank z obchodního rejstříku přes ARES (veřejné API Ministerstva financí).
// Ukládají se jen jména a data zápisu/výmazu v rejstříku. Data narození a adresy se nečtou dál.
export const ICO = { cs: "45244782", csob: "00001350", kb: "45317054", ucb: "64948242", rb: "49240901", moneta: "25672720", fio: "61858374" };
export const aresUrl = (ico) => `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/${ico}`;
export const orUrl = (ico) => `https://or.justice.cz/ias/ui/rejstrik-$firma?ico=${ico}`;
const EVENT_DAYS = 365;

const cap = (s) => String(s || "").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const jmeno = (o) => { const f = o.fyzickaOsoba; return f ? `${cap(f.jmeno)} ${cap(f.prijmeni)}`.trim() : (o.pravnickaOsoba?.obchodniJmeno || "").trim(); };
const funkce = (o) => o.clenstvi?.funkce?.nazev || o.funkce?.nazev || o.nazevAngazma || "";

// Z odpovědi ARES vytáhne členy představenstva a dozorčí rady (platné i vymazané).
export function parseVedeni(j) {
  const z = (j.zaznamy || []).find((x) => x.primarniZaznam) || (j.zaznamy || [])[0];
  if (!z) return null;
  const pick = (organy) => (organy || []).flatMap((org) => (org.datumVymazu ? [] : (org.clenoveOrganu || []))).map((m) => ({
    jmeno: jmeno(m), funkce: funkce(m), od: m.datumZapisu || null, do: m.datumVymazu || null,
  })).filter((m) => m.jmeno);
  const rada = (z.ostatniOrgany || []).filter((o) => o.typOrganu === "DOZORCI_RADA" || /dozorčí/i.test(o.nazevOrganu || ""));
  return { predstavenstvo: pick(z.statutarniOrgany), dozorci_rada: pick(rada), aktualizace_or: z.datumAktualizace || null };
}

export const platni = (list) => [...new Set(list.filter((m) => !m.do).map((m) => m.jmeno))].sort((a, b) => a.localeCompare(b, "cs"));

// Změny podle dat zápisu/výmazu v rejstříku za posledních EVENT_DAYS dní.
export function zmeny(bank, ico, v, now = Date.now()) {
  const out = [];
  const limit = new Date(now - EVENT_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [organ, label] of [["predstavenstvo", "představenstva"], ["dozorci_rada", "dozorčí rady"]]) {
    const cur = new Set(platni(v[organ]));
    for (const m of v[organ]) {
      // přišel: nový zápis osoby, která předtím v orgánu nebyla (ne jen přepis funkce)
      if (m.od && m.od >= limit && !m.do && !v[organ].some((x) => x.jmeno === m.jmeno && x.do && x.do <= m.od && x.od < m.od))
        out.push({ bank, typ: "prisel", organ: label, jmeno: m.jmeno, datum: m.od, url: orUrl(ico) });
      // odešel: výmaz osoby, která už v orgánu není
      if (m.do && m.do >= limit && !cur.has(m.jmeno))
        out.push({ bank, typ: "odesel", organ: label, jmeno: m.jmeno, datum: m.do, url: orUrl(ico) });
    }
  }
  const seen = new Set();
  return out.filter((e) => { const k = `${e.typ}|${e.organ}|${e.jmeno}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Rozdíl proti minulému dni (záloha, kdyby rejstřík data zápisu neuváděl).
export function diff(bank, ico, prev, cur, day) {
  const out = [];
  if (!prev) return out;
  for (const [organ, label] of [["predstavenstvo", "představenstva"], ["dozorci_rada", "dozorčí rady"]]) {
    const a = new Set(prev[organ] || []), b = new Set(cur[organ] || []);
    for (const n of b) if (!a.has(n)) out.push({ bank, typ: "prisel", organ: label, jmeno: n, datum: day, url: orUrl(ico) });
    for (const n of a) if (!b.has(n)) out.push({ bank, typ: "odesel", organ: label, jmeno: n, datum: day, url: orUrl(ico) });
  }
  return out;
}

// Načte vedení všech bank. Při chybě u banky ponechá její stará data.
export async function loadVedeni(old = {}, oldEvents = [], now = new Date()) {
  const vedeni = { ...old }, events = [];
  const day = now.toISOString().slice(0, 10);
  let ok = 0;
  for (const [bank, ico] of Object.entries(ICO)) {
    try {
      const r = await fetch(aresUrl(ico), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const v = parseVedeni(await r.json());
      if (!v || !v.predstavenstvo.length) throw new Error("bez členů představenstva");
      const cur = { predstavenstvo: platni(v.predstavenstvo), dozorci_rada: platni(v.dozorci_rada), aktualizace_or: v.aktualizace_or, url: orUrl(ico) };
      const ev = zmeny(bank, ico, v, now.getTime());
      for (const e of diff(bank, ico, old[bank], cur, day)) if (!ev.some((x) => x.typ === e.typ && x.jmeno === e.jmeno && x.organ === e.organ)) ev.push(e);
      events.push(...ev);
      vedeni[bank] = cur; ok++;
      console.log(`vedeni ${bank}: představenstvo ${cur.predstavenstvo.length}, dozorčí rada ${cur.dozorci_rada.length}, změny ${ev.length}`);
    } catch (e) {
      events.push(...oldEvents.filter((x) => x.bank === bank));
      console.warn(`vedeni ${bank}: CHYBA ${e.message}, ponechána stará data`);
    }
  }
  // starší zachycené změny (z rozdílu) se drží, dokud nejsou starší než rok
  const limit = new Date(now.getTime() - EVENT_DAYS * 864e5).toISOString().slice(0, 10);
  for (const e of oldEvents) if (e.datum >= limit && !events.some((x) => x.bank === e.bank && x.typ === e.typ && x.jmeno === e.jmeno && x.organ === e.organ)) events.push(e);
  events.sort((a, b) => b.datum.localeCompare(a.datum) || a.bank.localeCompare(b.bank));
  return { vedeni, zmeny: events, ok };
}

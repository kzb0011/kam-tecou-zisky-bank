(function () {
  "use strict";
  const D = window.BANK_DATA;
  const YEARS = ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025"];
  const app = document.getElementById("app");
  const tip = document.getElementById("tip");
  const SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- formátování ---------- */
  const nf = (d) => new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
  const f0 = nf(0), f1 = nf(1), f2 = nf(2);
  const mld = (v, d = 1) => (v == null ? "–" : nf(d).format(v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- odvozené údaje ---------- */
  const bankById = Object.fromEntries(D.banky.map((b) => [b.id, b]));
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  const profitSum = (b) => sum(YEARS.map((y) => b.zisk[y]));
  const latest = (obj) => {
    const ks = Object.keys(obj || {}).filter((k) => obj[k] != null).sort();
    return ks.length ? [ks[ks.length - 1], obj[ks[ks.length - 1]]] : [null, null];
  };
  function payouts(b) {
    if (b.dps) return b.dps.map((p) => ({ ze_zisku: p.ze_zisku, vyplaceno: p.vyplaceno, mld: (p.kc * b.akcie) / 1e9, kc: p.kc, dopocteno: true, zdroj: b.dps_zdroj }));
    return (b.dividendy || []).map((p) => Object.assign({ dopocteno: false }, p));
  }
  const abroadOf = (b, v) => (b.podil_zahranici == null || v == null ? null : v * b.podil_zahranici);
  function divByProfitYear(b) {
    const m = {};
    payouts(b).forEach((p) => { const r = /^(\d{4})(?!–)/.exec(p.ze_zisku); if (r) m[r[1]] = (m[r[1]] || 0) + p.mld; });
    return m;
  }
  function lastDividend(b) {
    const P = payouts(b).filter((p) => p.mld > 0 && /^\d{4}$/.test(p.vyplaceno) && +p.vyplaceno <= 2026);
    if (!P.length) return null;
    const y = P.map((p) => p.vyplaceno).sort().pop();
    return { rok: y, mld: sum(P.filter((p) => p.vyplaceno === y).map((p) => p.mld)) };
  }
  function profitPerEmployee(b) {
    const ys = Object.keys(b.zamestnanci || {}).filter((y) => b.zisk[y] != null).sort();
    if (!ys.length) return [null, null];
    const y = ys[ys.length - 1];
    return [y, (b.zisk[y] * 1e9) / b.zamestnanci[y]];
  }
  function plural(n, one, few, many) { return n + " " + (n === 1 ? one : n >= 2 && n <= 4 ? few : many); }
  function perClient(b) {
    if (!b.klienti_mil || b.zisk[b.klienti_rok] == null) return [null, null];
    return [b.klienti_rok, (b.zisk[b.klienti_rok] * 1e9) / (b.klienti_mil * 1e6)];
  }
  function ownChip(b) {
    if (b.kapital === "zahraniční") return `<span class="chip out">→ ${esc(b.zeme)}</span>`;
    if (b.kapital === "český") return `<span class="chip home">Zůstává v Česku</span>`;
    return `<span class="chip mix">Burza, největší akcionář PPF</span>`;
  }
  const colorOf = (b) => (b.kapital === "zahraniční" ? "var(--abroad)" : "var(--home)");
  function range(r, d = 0) { return r[0] === r[1] ? nf(d).format(r[0]) : nf(d).format(r[0]) + "–" + nf(d).format(r[1]); }
  function boardCell(b, key) {
    const x = b.board;
    if (!x || !x[key]) return `<span class="dim">neznámé</span>`;
    const est = (x[key + "_typ"] || x.typ) === "odhad";
    return `${range(x[key], est ? 0 : 1)} mil.${est ? ' <span class="est">odhad</span>' : ""}`;
  }
  function perMember(x) {
    if (!x || !x.total || !x.clenu || x.bez_prumeru) return null;
    return [x.total[0] / x.clenu, x.total[1] / x.clenu];
  }
  // průměrný zaměstnanec: roční daň z příjmů FO
  const PZ = D.prumerny_zamestnanec;
  const avgYearGross = PZ.mzda * 12;
  const avgYearTax = avgYearGross * PZ.sazba - PZ.sleva;

  /* ---------- tooltip ---------- */
  function showTip(ev, lines) {
    tip.innerHTML = "";
    lines.forEach((l, i) => { const d = document.createElement("div"); if (i === 0) d.className = "t"; d.textContent = l; tip.appendChild(d); });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  const el = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  /* ---------- grafy ---------- */
  function niceStep(max) {
    const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function vbars(host, items, opt) {
    host.innerHTML = "";
    const W = Math.max(300, host.clientWidth || 600), H = opt.h || 230, m = { t: 22, r: 6, b: 24, l: 6 };
    const max = Math.max(...items.map((d) => Math.max(d.v || 0, d.v2 || 0))) * 1.12 || 1;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.label || "" });
    const bw = (W - m.l - m.r) / items.length;
    const y = (v) => H - m.b - ((v || 0) / max) * (H - m.t - m.b);
    const g = el("g", { class: "grid" });
    const step = niceStep(max);
    for (let t = step; t < max; t += step) g.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    svg.appendChild(g);
    const barW = Math.min(34, bw * 0.66), showVal = bw > 38;
    const every = Math.ceil(items.length / Math.max(1, Math.floor(W / 46)));
    items.forEach((d, i) => {
      const cx = m.l + bw * i + bw / 2;
      if (d.v != null) {
        const r = el("rect", { x: cx - barW / 2, y: y(d.v), width: barW, height: Math.max(0, y(0) - y(d.v)), rx: 4, fill: d.c || "var(--home)" });
        const fm = opt.fmt || mld;
        r.addEventListener("mousemove", (ev) => showTip(ev, [d.k, fm(d.v) + " " + opt.unit].concat(d.v2 != null ? [(opt.unit2Label || "") + " " + fm(d.v2) + " " + opt.unit] : []).concat(d.note ? [d.note] : [])));
        r.addEventListener("mouseleave", hideTip);
        svg.appendChild(r);
        if (showVal) { const t = el("text", { x: cx, y: y(d.v) - 6, "text-anchor": "middle" }); t.textContent = (opt.fmt || ((v) => f0.format(v)))(d.v); svg.appendChild(t); }
      }
      if (d.v2 != null && d.v2 > 0) {
        const w2 = barW * 0.5;
        const r2 = el("rect", { x: cx - w2 / 2, y: y(d.v2), width: w2, height: Math.max(0, y(0) - y(d.v2)), rx: 3, fill: opt.c2 || "var(--abroad)" });
        r2.style.pointerEvents = "none"; svg.appendChild(r2);
      }
      if (i % every === 0) { const t = el("text", { x: cx, y: H - 6, "text-anchor": "middle" }); t.textContent = d.k; svg.appendChild(t); }
    });
    svg.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: "var(--line)" }));
    host.appendChild(svg);
  }
  // vodorovné pruhy; každá položka může mít více řad (series)
  function hbars(host, items, opt) {
    host.innerHTML = "";
    const series = opt.series || [{ key: "v", c: null }];
    const W = Math.max(300, host.clientWidth || 600), sub = 16, rowH = series.length * sub + 16, H = items.length * rowH + 6;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.label || "" });
    host.appendChild(svg);
    const probe = el("text", { class: "lbl" }); svg.appendChild(probe);
    let lw = 0; items.forEach((d) => { probe.textContent = d.k; lw = Math.max(lw, probe.getComputedTextLength()); });
    svg.removeChild(probe);
    lw = Math.min(W * 0.4, lw + 12);
    const vw = 70, max = Math.max(...items.flatMap((d) => series.map((s) => d[s.key] || 0))) || 1;
    const x = (v) => lw + (v / max) * Math.max(20, W - lw - vw);
    items.forEach((d, i) => {
      const yy = i * rowH + 4;
      const t = el("text", { class: "lbl", x: lw - 10, y: yy + rowH / 2, "dominant-baseline": "middle", "text-anchor": "end" });
      t.textContent = d.k; if (d.bold) t.setAttribute("font-weight", "700"); svg.appendChild(t);
      series.forEach((s, j) => {
        const v = d[s.key]; if (v == null) return;
        const by = yy + 8 + j * sub;
        const r = el("rect", { x: lw, y: by, width: Math.max(2, x(v) - lw), height: sub - 4, rx: 3, fill: (s.c || d.c || "var(--home)") });
        r.addEventListener("mousemove", (ev) => showTip(ev, [d.k, (s.name ? s.name + ": " : "") + (opt.fmt || mld)(v) + " " + opt.unit].concat(d.note ? [d.note] : [])));
        r.addEventListener("mouseleave", hideTip);
        svg.appendChild(r);
        const vt = el("text", { x: x(v) + 6, y: by + (sub - 4) / 2, "dominant-baseline": "middle" }); vt.textContent = (opt.fmt || mld)(v); svg.appendChild(vt);
      });
    });
  }
  function spark(b) {
    const vals = YEARS.map((y) => b.zisk[y]);
    const max = Math.max(...vals.filter((v) => v != null)), W = 300, H = 44, bw = W / vals.length;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, i) => v == null ? "" : `<rect x="${i * bw + bw * 0.18}" y="${H - (v / max) * (H - 2)}" width="${bw * 0.64}" height="${(v / max) * (H - 2)}" rx="2" fill="${colorOf(b)}" opacity="${i === vals.length - 1 ? 1 : 0.45}"></rect>`).join("")}</svg>`;
  }

  /* ---------- živé počítadlo ---------- */
  let tickTimer = null;
  const YEAR_SEC = 365 * 24 * 3600;
  const pageStart = Date.now();
  function startTickers() {
    clearInterval(tickTimer);
    const nodes = Array.from(document.querySelectorAll("[data-rate]"));
    const pnodes = Array.from(document.querySelectorAll("[data-rate-page]"));
    if (!nodes.length && !pnodes.length) return;
    const start = new Date("2026-01-01T00:00:00+01:00").getTime();
    const upd = () => {
      const sec = (Date.now() - start) / 1000;
      nodes.forEach((n) => { n.firstChild.nodeValue = f0.format(+n.dataset.rate * 1e9 * sec / YEAR_SEC); });
      const ps = (Date.now() - pageStart) / 1000;
      pnodes.forEach((n) => { n.textContent = f0.format(+n.dataset.ratePage * 1e9 * ps / YEAR_SEC); });
    };
    upd();
    const slow = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tickTimer = setInterval(upd, slow ? 1000 : 120);
  }

  /* ---------- sdílené bloky ---------- */
  const big5 = () => D.banky.filter((b) => b.kapital === "zahraniční");

  function leaderboard() {
    const rows = D.banky.slice().sort((a, b) => b.zisk["2025"] - a.zisk["2025"]);
    const max = Math.max(...rows.map((b) => b.zisk["2025"]));
    return `<div class="tw"><table>
      <thead><tr><th>#</th><th>Banka</th><th class="n">Zisk 2025</th><th class="n">Daň z příjmů 2025</th><th class="n">Poslední dividenda</th><th class="n">Šéf banky / rok</th><th class="n">Zisk na klienta</th><th class="n">Zisk 10 let</th></tr></thead>
      <tbody>${rows.map((b, i) => { const ld = lastDividend(b); const tx = b.dan["2025"]; return `
        <tr class="link" data-go="${b.id}">
          <td class="rank">${i + 1}</td>
          <td><a class="name" href="#${b.id}">${esc(b.nazev)}</a><br>${ownChip(b)}</td>
          <td class="n"><span class="bar-cell"><span class="b ${b.kapital === "zahraniční" ? "out" : ""}" style="width:${Math.round((b.zisk["2025"] / max) * 70)}px"></span>${mld(b.zisk["2025"])} mld.</span></td>
          <td class="n">${tx == null ? '<span class="dim">–</span>' : mld(tx, 2) + " mld."}</td>
          <td class="n">${ld && +ld.rok < 2024 ? '<span class="dim">nedohledáno</span>' : ld ? mld(ld.mld, 1) + ' mld. <span class="dim">(' + ld.rok + ")</span>" : b.kapital === "český" ? '<span class="dim">nevyplácí</span>' : '<span class="dim">–</span>'}</td>
          <td class="n"><span class="dim">${esc(b.sef.jmeno)}</span><br>${boardCell(b, "ceo")}</td>
          <td class="n">${(() => { const [cy, cv] = perClient(b); return cv == null ? "–" : f0.format(cv) + ' Kč <span class="dim">(' + cy + ")</span>"; })()}</td>
          <td class="n">${mld(profitSum(b))} mld.</td>
        </tr>`; }).join("")}</tbody></table></div>`;
  }

  function corpTable() {
    return `<div class="tw"><table><thead><tr><th>Firma</th><th>Vlastník</th><th class="n">Zisk</th><th class="n">Daň z příjmů 2025</th></tr></thead>
      <tbody>${D.korporace.map((c) => `<tr class="${/banka|spořitelna/i.test(c.nazev) ? "hl" : ""}"><td><a class="name" href="${esc(c.zdroj)}" target="_blank" rel="noopener">${esc(c.nazev)}</a></td><td class="dim">${esc(c.vlastnik)}</td>
        <td class="n">${mld(c.zisk)} mld. <span class="dim">(${esc(c.zisk_rok)})</span></td><td class="n">${mld(c.dan, 2)} mld.${c.dan_rok ? ' <span class="dim">(' + c.dan_rok + ")</span>" : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">Škoda Auto: provozní zisk, čistý zisk zatím nezveřejnila. Agrofert: zisk koncernu a daň za rok 2024, jeho firmy daň platí jednotlivě, proto v žebříčku chybí.</p>`;
  }

  function costBlock() {
    const cols = { "Personální": "var(--abroad)", "Správní a IT": "var(--home)", "Odpisy": "var(--tax)" };
    const rows = D.banky.filter((b) => b.naklady && b.naklady["2025"]).map((b) => { const n = b.naklady["2025"], tot = sum(Object.values(n)); return { b, n, tot }; }).sort((a, c) => c.tot - a.tot);
    return `<div class="tw"><table><thead><tr><th>Banka</th><th class="n">Náklady 2025</th><th>Struktura</th><th class="n">Podíl mezd</th></tr></thead>
      <tbody>${rows.map(({ b, n, tot }) => `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.zkratka)}</a></td><td class="n">${mld(tot, 1)} mld.</td>
        <td style="min-width:140px"><div class="stack" style="height:14px" role="img" aria-label="Struktura nákladů ${esc(b.zkratka)}">${Object.entries(n).map(([k, v]) => `<span style="flex:${v};background:${cols[k] || cols[k.split(" ")[0]] || "var(--bar-muted)"}" title="${esc(k)}: ${mld(v, 2)} mld."></span>`).join("")}</div></td>
        <td class="n">${n["Personální"] ? f0.format((n["Personální"] / tot) * 100) + " %" : "–"}</td></tr>`).join("")}</tbody></table></div>
      <div class="legend" style="margin-top:8px">${Object.entries(cols).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join("")}<span><i style="background:var(--bar-muted)"></i>ostatní (odvody do fondů, bankovní daně)</span></div>
      <p class="note">Provozní náklady v mld. Kč podle výročních zpráv a výsledků bank. Investice do IT se v účetnictví projevují hlavně jako odpisy a správní náklady. UniCredit zahrnuje i Slovensko a odpisy v rozpisu neuvádí. Moneta strukturu v podkladech nemá.</p>`;
  }

  function ownershipBlock() {
    const A = D.sektor.aktiva, f5 = ["cs", "csob", "kb", "ucb", "rb"];
    const foreign = sum(f5.map((k) => A.banky[k])), mon = A.banky.moneta, air = A.banky.airbank;
    const rest = A.celkem - foreign - mon - air;
    const parts = [["5 bank zahraničních skupin", foreign, "var(--abroad)"], ["Moneta (burza)", mon, "var(--est)"], ["Air Bank (PPF)", air, "var(--home)"], ["Ostatní banky, stavební spořitelny, pobočky", rest, "var(--bar-muted)"]];
    return `<p class="big-stat"><b style="color:var(--abroad)">${f0.format((foreign / A.celkem) * 100)} %</b> aktiv celého bankovního sektoru drží pět bank, které patří Erste, KBC, Société Générale, UniCredit a Raiffeisen.</p>
      <div class="stack" role="img" aria-label="Podíl na aktivech sektoru">${parts.map((x) => `<span style="flex:${x[1]};background:${x[2]}" title="${esc(x[0])}"></span>`).join("")}</div>
      <div class="legend" style="margin-top:8px">${parts.map((x) => `<span><i style="background:${x[2]}"></i>${esc(x[0])}: ${f0.format((x[1] / A.celkem) * 100)} %</span>`).join("")}</div>
      <p class="note">Aktiva ke konci roku ${A.rok}: sektor ${f0.format(A.celkem)} mld. Kč (ČNB), banky zaokrouhleně podle výročních zpráv. Skutečný zahraniční podíl je vyšší: i ve skupině „ostatní“ je většina bank a poboček v zahraničních rukou. U KB vlastní matka ${f0.format(bankById.kb.podil_zahranici * 100)} %. <a href="${esc(A.zdroj)}" target="_blank" rel="noopener">Zdroj</a></p>`;
  }

  function marginBlock(id) {
    const S = D.sektor.sazby, U = D.sektor.uroky_h1_2025;
    const dep = S.vklady[0][1], mort = S.uvery[0][1];
    afterRender.push(() => hbars(document.getElementById(id), S.vklady.map((r) => ({ k: r[0], v: r[1], c: "var(--home)" })).concat(S.uvery.map((r) => ({ k: r[0], v: r[1], c: "var(--abroad)" }))), { unit: "% ročně", fmt: (v) => f2.format(v), label: "Úrokové sazby" }));
    return `<div class="legend"><span><i style="background:var(--home)"></i>banka platí vám (vklady)</span><span><i style="background:var(--abroad)"></i>vy platíte bance (úvěry)</span></div>
      <div class="chart" id="${id}"></div>
      <div class="facts">
        <div class="fact home">Milion na běžném účtu vám za rok vynese asi <b>${f0.format(1e6 * dep / 100)} Kč</b>.</div>
        <div class="fact">Milion nové hypotéky vás v prvním roce stojí asi <b>${f0.format(1e6 * mort / 100)} Kč</b> na úrocích.</div>
        <div class="fact tax">V 1. pololetí 2025 banky vybraly na úrocích <b>${f0.format(U.vynosy)} mld. Kč</b>. Po zaplacení úroků vkladatelům a věřitelům jim zůstalo <b>${f0.format(U.zisk)} mld. Kč</b>.</div>
      </div>
      <p class="note">Průměrné sazby ČNB za ${esc(S.obdobi)} u nových obchodů domácností. <a href="#sazby">Jsou tyhle sazby férové? →</a> Příklady jsou zjednodušené: hypotéka se splácí a úrok klesá. Banky si půjčují i jinde než od klientů, proto rozdíl sazeb není celý jejich zisk. <a href="${esc(S.zdroj)}" target="_blank" rel="noopener">Sazby</a> · <a href="${esc(U.zdroj)}" target="_blank" rel="noopener">ČNB, Zpráva o finanční stabilitě</a></p>`;
  }

  function ceoPay() {
    const pub = D.banky.filter((b) => b.board && b.board.ceo && b.board.typ !== "odhad");
    return { avg: sum(pub.map((b) => b.board.ceo[0])) / pub.length, pub };
  }
  function ceoBlock() {
    const { avg, pub } = ceoPay();
    const emp = D.sektor.mzda_finance_kc * 12, mult = (avg * 1e6) / emp;
    const perSecCeo = (avg * 1e6) / YEAR_SEC, perSecEmp = emp / YEAR_SEC;
    const ranked = D.banky.filter((b) => b.board && b.board.ceo).map((b) => ({ b, mid: (b.board.ceo[0] + b.board.ceo[1]) / 2, tot: b.board.total ? b.board.total[0] : 0 })).sort((a, c) => c.mid - a.mid || c.tot - a.tot).slice(0, 3);
    return `<section class="card"><div class="card-head"><h2>Šéf banky vs. bankovní úředník</h2><a class="cta" href="#mzdy">Mzdy a odměny →</a></div>
      <div class="hero">
        <div class="counter out"><span class="eyebrow">Šéf české banky od 1. 1. 2026</span><span class="big" data-rate="${avg / 1000}">0<small>Kč</small></span><span class="sub">${f2.format(perSecCeo)} Kč každou sekundu, dnem i nocí. Průměr zveřejněných odměn šéfů (${pub.map((b) => esc(b.zkratka)).join(", ")}): ${f1.format(avg)} mil. Kč ročně.</span></div>
        <div class="counter home"><span class="eyebrow">Průměrný zaměstnanec finančnictví od 1. 1. 2026</span><span class="big" data-rate="${emp / 1e9}">0<small>Kč</small></span><span class="sub">${f2.format(perSecEmp)} Kč za sekundu. Hrubá mzda ${f0.format(D.sektor.mzda_finance_kc)} Kč měsíčně (${esc(D.sektor.mzda_finance_zdroj)}).</span></div>
      </div>
      <p class="big-stat" style="margin-top:14px"><b style="color:var(--abroad)">${f0.format(mult)}×</b> víc bere šéf banky než průměrný zaměstnanec. Za rok si šéf vydělá tolik co zaměstnanec za ${f0.format(mult)} let.</p>
      <h3>Nejlépe placení šéfové bank</h3>
      <div class="facts">${ranked.map(({ b }, i) => `<a class="fact ${b.board.typ === "odhad" ? "" : "home"}" href="#${b.id}" style="color:inherit;text-decoration:none"><span class="who">${avatar(b)}<span><span class="fh" style="margin:0">${esc(b.sef.jmeno)}</span><span class="dim">${i + 1}. ${esc(b.nazev)}</span></span></span><span style="font-family:var(--font-data);font-size:1.4rem">${range(b.board.ceo)} mil. Kč</span> ${b.board.typ === "odhad" ? '<span class="est">odhad</span>' : '<span class="dim">zveřejněno</span>'}<br><span class="note">${b.board.total ? "Celé představenstvo " + range(b.board.total, 1) + " mil. Kč" + ((b.board.total_typ || b.board.typ) === "odhad" ? " (odhad)" : " (zveřejněno)") : ""}</span></a>`).join("")}</div>
      <p class="note">Odměnu šéfa zveřejňují jen KB (zpráva o odměňování) a Moneta (média). U ostatních bank je odhad podle zveřejněných odměn celého představenstva. Pořadí podle středu rozpětí.</p></section>`;
  }
  function indicatorTiles() {
    const P = D.sektor.pobocky.rady, p0 = P["2013"], p1 = P["2025"];
    const IX = D.sektor.index.rady, last = IX[IX.length - 1];
    const cz = D.mzdy.find((w) => w.zeme === "Česko");
    return `<div class="strip tiles">
      <a class="stat" href="#propousteni"><span class="lab">Propouštění a pobočky</span><span class="val">−${f0.format(((p0 - p1) / p0) * 100)} %</span><span class="sub">poboček od roku 2013 (${f0.format(p0)} → ${f0.format(p1)}) →</span></a>
      <a class="stat" href="#mzdy"><span class="lab">Mzdy v bankách</span><span class="val">${f1.format(cz.eur / cz.prumer_eur)}×</span><span class="sub">víc než průměr ČR, ${esc(cz.mistni)} hrubého →</span></a>
      ${(() => { const tb = D.banky.filter((x) => x.dan["2025"] != null), tx = sum(tb.map((x) => x.dan["2025"])), pr = sum(tb.map((x) => x.zisk["2025"])); return `<a class="stat" href="#dane"><span class="lab">Daň z příjmů bank 2025</span><span class="val">${mld(tx, 1)} mld.</span><span class="sub">${f0.format((tx / pr) * 100)} % z čistého zisku ${tb.length} bank →</span></a>`; })()}
    </div>`;
  }
  function howBlock() {
    const S = D.sektor.sazby, U = D.sektor.uroky_h1_2025, cb = D.sektor.ferovost.cz_banka;
    const cur = S.vklady[0][1], dep = S.vklady[1][1], mort = S.uvery[0][1], card = S.uvery[3][1];
    return `<div class="how">
        <div class="how-step home"><span class="n">1</span><p><b>Vy půjčujete bance.</b> Peníze na účtu banka používá. Na běžném účtu za ně dostanete průměrně <b>${f2.format(cur)} %</b> ročně, na spořicích a dalších vkladech na požádání ${f2.format(dep)} %.</p></div>
        <div class="how-step"><span class="n">2</span><p><b>Banka půjčuje vám.</b> Za novou hypotéku platíte průměrně <b>${f2.format(mort)} %</b>, za kreditní kartu ${f2.format(card)} %. Volné peníze může banka uložit u ČNB za ${f2.format(cb)} %.</p></div>
        <div class="how-step tax"><span class="n">3</span><p><b>Rozdíl je zisk banky.</b> V 1. pololetí 2025 banky vybraly na úrocích ${f0.format(U.vynosy)} mld. Kč. Po zaplacení úroků vkladatelům a věřitelům jim zůstalo <b>${f0.format(U.zisk)} mld. Kč</b>.</p></div>
      </div>
      <p class="note">Příklad: milion na běžném účtu vám za rok vynese ${f0.format(1e6 * cur / 100)} Kč, milion hypotéky vás v prvním roce stojí asi ${f0.format(1e6 * mort / 100)} Kč na úrocích. Průměrné sazby ČNB za ${esc(S.obdobi)}. <a href="#sazby">Jsou tyhle sazby férové? →</a></p>`;
  }

  /* ---------- živá data (denně z GitHub Actions) ---------- */
  const L = window.LIVE_DATA || { zpravy: [], aplikace: {} };
  const ago = (iso) => { const h = (Date.now() - new Date(iso)) / 36e5; return h < 1 ? "před chvílí" : h < 24 ? `před ${Math.floor(h)} h` : h < 48 ? "včera" : `před ${Math.floor(h / 24)} dny`; };
  const liveStamp = () => (L.aktualizace ? `Aktualizováno ${new Date(L.aktualizace).toLocaleDateString("cs-CZ")}` : "Data se načtou po první automatické aktualizaci");
  function newsList(items, n) {
    if (!items.length) return `<p class="note">Zatím žádné zprávy. ${liveStamp()}.</p>`;
    return `<ul class="news">${items.slice(0, n).map((x) => { const b = bankById[x.bank]; return `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="dim">${b ? `<span class="chip ${b.kapital === "zahraniční" ? "out" : "home"}">${esc(b.zkratka)}</span> ` : ""}${esc(x.source || "")} · ${ago(x.date)}</span></li>`; }).join("")}</ul>`;
  }
  function newsCard() {
    return `<section class="card"><div class="card-head"><h2>Zprávy o bankách</h2><span class="dim">${liveStamp()}</span></div>${newsList(L.zpravy || [], 8)}
      <p class="note">Automatický výběr titulků z českých médií přes Google News, každý den. Odkazy vedou na původní články.</p></section>`;
  }
  function appsCard() {
    const A = L.aplikace || {};
    const rows = D.banky.filter((b) => A[b.id]).map((b) => ({ b, a: A[b.id] })).sort((x, y) => y.a.rating - x.a.rating);
    return `<section class="card"><div class="card-head"><h2>Hodnocení bankovních aplikací · App Store</h2><span class="dim">${liveStamp()}</span></div>
      ${rows.length ? `<div class="tw"><table><tbody>${rows.map(({ b, a }) => { const h = a.historie || [], d = h.length > 1 ? Math.round((a.rating - h[0].r) * 100) / 100 : 0, nd = h.length > 1 ? Math.round((new Date(h[h.length - 1].d) - new Date(h[0].d)) / 864e5) : 0, dny = nd === 1 ? "den" : nd < 5 ? "dny" : "dní"; return `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.zkratka)}</a><br><span class="dim">${esc(a.name)}</span></td>
        <td class="n"><span class="bar-cell"><span class="b ${a.rating >= 4.5 ? "tax" : "muted"}" style="width:${Math.round((a.rating / 5) * 90)}px"></span>${f2.format(a.rating)} ★</span><span class="dim">${f0.format(a.count)} hodnocení${d && nd ? ` · ${d > 0 ? "▲" : "▼"} ${f2.format(Math.abs(d))} za ${nd} ${dny}` : ""}</span></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="note">${liveStamp()}.</p>`}
      <p class="note">Průměrné hodnocení v českém App Store, denně. Trend se počítá z historie posledních až 90 dní.</p></section>`;
  }

  /* ---------- pohledy ---------- */
  const views = {};
  const afterRender = [];

  /* ---------- dashboard na přehledu ---------- */
  const initials = (n) => n.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const avatar = (b) => `<span class="ava ${b.kapital === "zahraniční" ? "out" : "home"}" title="${esc(b.sef.jmeno)}">${esc(initials(b.sef.jmeno))}</span>`;
  const delta = (a, b) => { if (a == null || b == null) return ""; const d = (a / b - 1) * 100; return `<span class="delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${f1.format(Math.abs(d))} % proti 2024</span>`; };
  const BANK_ORDER = () => D.banky.slice().sort((a, b) => b.zisk["2025"] - a.zisk["2025"]);
  const colorFor = (b) => (b.kapital === "zahraniční" ? "var(--abroad)" : b.kapital === "český" ? "var(--home)" : "var(--est)");
  function waffle(parts, total) {
    const cells = [];
    parts.forEach((p) => { for (let k = 0; k < Math.round(p.v); k++) cells.push(`<i style="background:${p.c}" title="${esc(p.k)}"></i>`); });
    while (cells.length < Math.round(total)) cells.push('<i class="rest"></i>');
    return `<div class="waffle" role="img" aria-label="1 tečka = 1 mld. Kč">${cells.join("")}</div>`;
  }
  function mbars(items, opt = {}) {
    const max = Math.max(...items.map((x) => x.v), 0.0001), base = opt.base || 0;
    return `<div class="mbars">${items.map((x) => `<div class="mb" title="${esc(x.k)}: ${opt.fmt ? opt.fmt(x.v) : mld(x.v, 1) + " mld. Kč"}"><span style="height:${Math.max(4, ((x.v - base) / (max - base)) * 100)}%;background:${x.c}"></span><em>${esc(x.k)}</em></div>`).join("")}</div>`;
  }
  function fairTop() {
    const F = D.sektor.ferovost, T = F.nabidky_pasma, dep = D.sektor.index.rady.slice(-1)[0][2];
    const ID = { "Česká spořitelna": "cs", "ČSOB": "csob", "Komerční banka": "kb", "UniCredit Bank": "ucb", "Raiffeisenbank": "rb", "MONETA": "moneta", "Fio banka": "fio" };
    const rows = Object.entries(T).map(([k, r]) => ({ k, r, v: Math.round(((r[0] + r[1] + r[2]) / 3) * 100) / 100, b: bankById[ID[k]] })).sort((a, c) => c.v - a.v || c.r[0] - a.r[0]);
    // pořadí se shodami: stejná sazba = stejné místo
    let place = 0, prevV = null; rows.forEach((x, i) => { if (x.v !== prevV) { place = i + 1; prevV = x.v; } x.place = place; });
    const why = (x) => {
      const same = x.r[0] === x.r[2];
      return same ? "stejná sazba na celou částku do 500 tis." : `${f2.format(x.r[0])} % jen do ${x.r[1] === x.r[0] ? "300" : "150"} tis., pak ${f2.format(x.r[2])} %`;
    };
    return { rows, why, top: rows.filter((x) => x.place <= 3) };
  }
  function fairCard(b) {
    const IX = D.sektor.index.rady, last = IX[IX.length - 1], prev = IX[IX.length - 2], F = D.sektor.ferovost;
    const g = last[1] - last[2], dg = g - (prev[1] - prev[2]);
    const { rows, why, top } = fairTop();
    const head = `<div class="kh">Index férovosti vkladů · ${esc(F.obdobi)}</div><div class="kv out">${f2.format(g)}<small>p. b.</small> <span class="delta ${dg > 0 ? "down" : "up"}" style="font-size:.7rem;letter-spacing:0;vertical-align:middle">${dg > 0 ? "▲ o " + f2.format(dg) + " horší" : dg < 0 ? "▼ o " + f2.format(-dg) + " lepší" : "beze změny"}</span></div>
      <span class="dim">O tolik méně dostanete na vkladech (${f2.format(last[2])} %), než dává ČNB bankám (${f2.format(last[1])} %).</span>`;
    if (!b) {
      return `<div class="kpi">${head}<div class="kh" style="margin-top:8px">3 nejférovější banky pro spořicí účet</div>
        <div class="ceo-list">${top.map((x) => `<div class="ceo-row"><span class="rk">${x.place}</span><span class="cn"><b>${esc(x.k)}</b><span class="dim">${why(x)}</span></span><span class="cv" style="color:var(--tax)">${f2.format(x.v)} %</span></div>`).join("")}</div>
        <a class="kf" href="#sazby" style="text-decoration:none">Průměr sazby při vkladu 150, 300 a 500 tis. Kč, ${esc(F.nabidky_datum)} · celý žebříček →</a></div>`;
    }
    const pos = rows.findIndex((x) => x.b && x.b.id === b.id);
    const me = rows[pos];
    return `<div class="kpi">${head}${me ? `<div class="kh" style="margin-top:8px">Spořicí účet ${esc(b.zkratka)}</div><div class="kv tax" style="font-size:1.8rem">${f2.format(me.v)}<small>% v průměru</small></div><span class="dim">${me.place}. místo z ${rows.length} velkých bank · ${why(me)}</span>` : '<span class="dim">Banka ve srovnání spořicích účtů není.</span>'}
      <a class="kf" href="#sazby" style="text-decoration:none">Celý žebříček →</a></div>`;
  }
  function kpiHtml(sel) {
    const s = D.sektor, all = sel === "all", b = all ? null : bankById[sel];
    const emp = s.mzda_finance_kc * 12;
    let c1, c2, c3, c4;
    if (all) {
      const banks = BANK_ORDER(), known = sum(banks.map((x) => x.zisk["2025"]));
      c1 = `<div class="kpi"><div class="kh">Čistý zisk 2025 · všechny banky</div><div class="kv">${mld(s.zisk["2025"])}<small>mld. Kč</small></div>${delta(s.zisk["2025"], s.zisk["2024"])}
        ${waffle(banks.map((x) => ({ k: x.zkratka, v: x.zisk["2025"], c: colorFor(x) })), s.zisk["2025"])}
        <div class="kf"><span><i style="background:var(--abroad)"></i>zahraniční vlastník</span><span><i style="background:var(--home)"></i>český</span><span><i class="rest"></i>ostatní banky</span> · 1 tečka = 1 mld.</div></div>`;
      const pay = banks.map((x) => { const v = sum(payouts(x).filter((p) => String(p.vyplaceno) === "2025").map((p) => p.mld)); return { x, v, ab: abroadOf(x, v) }; }).filter((r) => r.v > 0);
      const tot = sum(pay.map((r) => r.v)), ab = sum(pay.map((r) => r.ab || 0));
      c2 = `<div class="kpi"><div class="kh">Dividendy vyplacené v roce 2025</div><div class="kv out">${mld(tot, 1)}<small>mld. Kč</small></div><span class="dim">z toho do zahraničí nejméně <b style="color:var(--abroad)">${mld(ab, 1)} mld.</b></span>
        ${mbars(pay.map((r) => ({ k: r.x.zkratka, v: r.v, c: colorFor(r.x) })))}</div>`;
      const ranked = banks.filter((x) => x.board && x.board.ceo).map((x) => ({ x, mid: (x.board.ceo[0] + x.board.ceo[1]) / 2, tot: x.board.total ? x.board.total[0] : 0 })).sort((a, c) => c.mid - a.mid || c.tot - a.tot).slice(0, 3);
      c3 = `<div class="kpi"><div class="kh">Nejlépe placení šéfové bank · ročně</div>
        <div class="ceo-list">${ranked.map(({ x }, k) => `<a class="ceo-row" href="#${x.id}">${avatar(x)}<span class="cn"><b>${esc(x.sef.jmeno)}</b><span class="dim">${k + 1}. ${esc(x.zkratka)}</span></span><span class="cv">${range(x.board.ceo)}<small>mil. Kč</small>${x.board.typ === "odhad" ? '<span class="est">odhad</span>' : ""}</span></a>`).join("")}</div>
        <a class="kf" href="#mzdy" style="text-decoration:none">Všichni šéfové a představenstva →</a></div>`;
      c4 = fairCard(null);
    } else {
      const dv = payouts(b).filter((p) => p.mld > 0).sort((p, q) => String(p.vyplaceno).localeCompare(String(q.vyplaceno)));
      const byY = {}; dv.forEach((p) => { byY[p.vyplaceno] = (byY[p.vyplaceno] || 0) + p.mld; });
      const ys = Object.keys(byY).slice(-6), last = ys[ys.length - 1];
      c1 = `<div class="kpi"><div class="kh">Čistý zisk 2025 · ${esc(b.nazev)}</div><div class="kv">${mld(b.zisk["2025"], 1)}<small>mld. Kč</small></div>${delta(b.zisk["2025"], b.zisk["2024"])}
        ${waffle([{ k: b.zkratka, v: b.zisk["2025"], c: colorFor(b) }], b.zisk["2025"])}<div class="kf">Za 10 let ${mld(profitSum(b))} mld. Kč · 1 tečka = 1 mld.</div></div>`;
      c2 = `<div class="kpi"><div class="kh">Dividendy vlastníkům</div>${last ? `<div class="kv ${b.kapital === "zahraniční" ? "out" : ""}">${mld(byY[last], 1)}<small>mld. Kč v ${last}</small></div><span class="dim">${b.kapital === "český" ? "zůstává v Česku" : b.podil_zahranici == null ? "podíl do zahraničí nelze určit" : "do zahraničí: " + mld(abroadOf(b, byY[last]), 1) + " mld. (" + esc(b.zeme) + ")"}</span>${mbars(ys.map((y) => ({ k: y, v: byY[y], c: colorFor(b) })))}` : '<div class="kv">–</div><span class="dim">nedohledáno</span>'}</div>`;
      const bd = b.board || {};
      c3 = `<div class="kpi"><div class="kh">Příjem šéfa banky · ročně</div><div class="who">${avatar(b)}<div><b>${esc(b.sef.jmeno)}</b>${b.sef.pozn ? `<br><span class="dim">${esc(b.sef.pozn)}</span>` : ""}</div></div>
        ${bd.ceo ? `<div class="kv">${range(bd.ceo)}<small>mil. Kč</small></div><span class="dim">${bd.typ === "odhad" ? '<span class="est">odhad</span>' : "zveřejněno"}${bd.total ? " · celé představenstvo " + range(bd.total, 1) + " mil. Kč" : ""}</span>` : `<div class="kv">–</div><span class="dim">${bd.total ? "celé vedení " + range(bd.total, 1) + " mil. Kč" : "odměnu nezveřejňuje"}</span>`}</div>`;
      c4 = fairCard(b);
    }
    return c1 + c2 + c3 + c4 + (all ? "" : `<a class="kpi-more" href="#${b.id}">Celý profil banky ${esc(b.nazev)} →</a>`);
  }

  views.prehled = () => {
    const s = D.sektor;
    const rateSector = s.zisk["2025"];
    const perPerson = (rateSector * 1e9) / (s.obyvatel_mil * 1e6);
    const B = big5();
    const tax5 = sum(B.map((b) => b.dan["2025"]));
    const prof5 = sum(B.map((b) => b.zisk["2025"]));
    const cs = bankById.cs;
    const csPerMin = (cs.zisk["2025"] * 1e9) / (YEAR_SEC / 60);
    const csDiv = (cs.dividendy || []).slice().sort((a, c) => String(c.vyplaceno).localeCompare(String(a.vyplaceno)))[0];
    const top20 = D.dan_top20_2025;
    const bankTaxTop = sum(top20.filter((r) => r[2] === "banka").map((r) => r[1]));
    afterRender.push(() => {
      hbars(document.getElementById("ch-zisk-dan"), B.concat([bankById.moneta, bankById.fio]).sort((a, b) => b.zisk["2025"] - a.zisk["2025"]).map((b) => ({ k: b.zkratka, zisk: b.zisk["2025"], dan: b.dan["2025"] })), { unit: "mld. Kč", series: [{ key: "zisk", c: "var(--abroad)", name: "Čistý zisk" }, { key: "dan", c: "var(--tax)", name: "Daň z příjmů" }], label: "Zisk a daň 2025" });
      hbars(document.getElementById("ch-top20"), top20.slice(0, 12).map((r) => ({ k: r[0], v: r[1], c: r[2] === "banka" ? "var(--home)" : "var(--bar-muted)", bold: r[2] === "banka" })), { unit: "mld. Kč", fmt: (v) => f1.format(v), label: "Největší plátci daně" });
      vbars(document.getElementById("ch-sector"), YEARS.map((y) => ({ k: y, v: s.zisk[y], c: "var(--home)", note: y === "2016" ? "dopočteno" : "" })), { unit: "mld. Kč", label: "Zisk sektoru", h: 200 });
      const pills = document.getElementById("pills"), kpi = document.getElementById("kpi"), ttl = document.getElementById("hero-sub");
      pills.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-sel]"); if (!btn) return;
        pills.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === btn ? "true" : "false"));
        const sel = btn.dataset.sel;
        kpi.innerHTML = kpiHtml(sel);
        ttl.textContent = sel === "all" ? "v celém Česku" : bankById[sel].nazev;
      });
      startTickers();
    });
    return `
    <section class="hero-top">
      <span class="eyebrow live">Živě · odhad podle tempa roku 2025</span>
      <h1>Zisky českých bank<br><span class="h1-sub" id="hero-sub">v celém Česku</span></h1>
      <p class="lead">Všechny banky v Česku dohromady vydělaly za rok 2025 <b>${mld(rateSector)} mld. Kč</b> čistého. To je <b>${f0.format(Math.round(perPerson / 100) * 100)} Kč na každého obyvatele</b>, asi ${f0.format(Math.round(perPerson / 12 / 10) * 10)} Kč měsíčně. Pět největších patří zahraničním skupinám a jejich zisk míří do Rakouska, Belgie, Francie a Itálie.</p>
      <p class="since"><span class="eyebrow live">Od otevření této stránky</span> banky vydělaly <b data-rate-page="${rateSector}">0</b> Kč</p>
      <div class="pills" id="pills" role="group" aria-label="Vyber banku">
        <button type="button" data-sel="all" aria-pressed="true">Všechny <em>7</em></button>
        ${BANK_ORDER().map((b) => `<button type="button" data-sel="${b.id}" aria-pressed="false"><i style="background:${colorFor(b)}"></i>${esc(b.zkratka)} <em>${mld(b.zisk["2025"], 1)}</em></button>`).join("")}
      </div>
    </section>
    <div class="kpis" id="kpi">${kpiHtml("all")}</div>

    <div class="hero">
      <div class="counter"><span class="eyebrow">Zisk všech bank od 1. 1. 2026</span><span class="big" data-rate="${rateSector}">0<small>Kč</small></span><span class="sub">Tempo roku 2025 (${mld(rateSector)} mld. Kč za rok, ČNB)</span></div>
      <div class="counter out"><span class="eyebrow">Dividendy do zahraničí od 1. 1. 2026</span><span class="big" data-rate="${s.dividendy_banky_pojistovny["2024"]}">0<small>Kč</small></span><span class="sub">Banky a pojišťovny, tempo roku 2024 (${mld(s.dividendy_banky_pojistovny["2024"])} mld. Kč, ČNB)</span></div>
      <div class="counter tax"><span class="eyebrow">Daň z příjmů 5 zahraničních bank od 1. 1. 2026</span><span class="big" data-rate="${tax5}">0<small>Kč</small></span><span class="sub">Tempo roku 2025 (${mld(tax5, 1)} mld. Kč, Finanční správa)</span></div>
    </div>
    ${indicatorTiles()}
    <div class="facts">
      <div class="fact">Česká spořitelna vydělá průměrnou roční mzdu (${f0.format(avgYearGross)} Kč) za <b>${f1.format(avgYearGross / csPerMin)} minuty</b>.</div>
      <div class="fact tax">Na každou korunu daně z příjmů připadá u pěti zahraničních bank <b>${f1.format(prof5 / tax5)} Kč</b> čistého zisku.</div>
      ${csDiv ? `<div class="fact">Spořitelna poslala v roce ${csDiv.vyplaceno} rakouské Erste <b>${mld(csDiv.mld)} mld. Kč</b>. Na dani z příjmů zaplatila v roce ${csDiv.vyplaceno} <b>${mld(cs.dan[csDiv.vyplaceno], 1)} mld. Kč</b>.</div>` : ""}
    </div>

    <div class="grid2">${newsCard()}${appsCard()}</div>
    <section class="card">
      <div class="card-head"><h2>Žebříček bank</h2><a class="cta" href="#banky">Všechny banky →</a></div>
      ${leaderboard()}
      <p class="note">Daň = daň z příjmů právnických osob uhrazená v roce 2025 podle Finanční správy, u Monety a Fio z výkazu peněžních toků ve výroční zprávě. Šéf banky: u KB a Monety zveřejněno, u ostatních <span class="est">odhad</span> (viz Metodika). UniCredit zahrnuje i Slovensko.</p>
    </section>

    <div class="grid2">
      <section class="card"><h2>Jak banky vydělávají na úrocích</h2>${howBlock()}</section>
      <section class="card"><h2>Komu patří české bankovnictví</h2>${ownershipBlock()}
        <h3 style="margin-top:14px">Zisk na jednoho klienta</h3>
        <div class="tw"><table><thead><tr><th>Banka</th><th class="n">Klienti</th><th class="n">Zisk na klienta / rok</th></tr></thead>
        <tbody>${D.banky.map((b) => [b, perClient(b)]).filter((x) => x[1][1] != null).sort((a, c) => c[1][1] - a[1][1]).map(([b, [cy, cv]]) => `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.nazev)}</a>${b.klienti_pozn ? '<br><span class="dim">' + esc(b.klienti_pozn) + "</span>" : ""}</td><td class="n">${f1.format(b.klienti_mil)} mil. <span class="dim">(${cy})</span></td><td class="n">${f0.format(cv)} Kč</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Čistý zisk ÷ počet klientů ve stejném roce podle výročních zpráv a výsledků bank. Banky počítají klienty různě (banka / skupina, aktivní / všichni) a vydělávají i na firmách. Orientační srovnání. UniCredit počet klientů nezveřejňuje.</p></section>
    </div>

    <div class="grid2">
      <section class="card"><h2>Zisk vs. daň 2025</h2>
        <div class="legend"><span><i style="background:var(--abroad)"></i>čistý zisk</span><span><i style="background:var(--tax)"></i>zaplacená daň z příjmů</span></div>
        <div class="chart" id="ch-zisk-dan"></div>
        <p class="note">Daň se platí ze zisku předchozího období a záloh, proto neodpovídá přesně 21 % zisku.</p></section>
      <section class="card"><h2>Kdo platí státu nejvíc</h2>
        <p class="note">Daň z příjmů právnických osob 2025, mld. Kč. Banky modře. Šest bank z TOP 20 zaplatilo dohromady <b style="color:var(--ink)">${mld(bankTaxTop, 1)} mld. Kč</b>.</p>
        <div class="chart" id="ch-top20"></div><a class="cta" href="#dane">Celý žebříček a srovnání →</a></section>
    </div>

    <div class="grid2">
      <section class="card"><h2>Za co banky utrácejí</h2>${costBlock()}</section>
      <section class="card"><h2>Zisk celého sektoru</h2><p class="note">Mld. Kč po zdanění, všechny banky. Propad 2020 způsobil covid, skok 2022 vysoké sazby ČNB.</p><div class="chart" id="ch-sector"></div></section>
    </div>`;
  };

  views.dane = () => {
    const top20 = D.dan_top20_2025;
    const B = D.banky.filter((b) => b.dan["2025"] != null);
    afterRender.push(() => {
      hbars(document.getElementById("ch-top20-full"), top20.map((r) => ({ k: r[0], v: r[1], c: r[2] === "banka" ? "var(--home)" : r[2] === "zbrojení" ? "var(--est)" : "var(--bar-muted)", bold: r[2] === "banka" })), { unit: "mld. Kč", fmt: (v) => f2.format(v), label: "TOP 20 plátců daně" });
    });
    return `
    <section><h1>Daně a srovnání</h1>
      <p class="lead">Kolik banky platí státu na dani z příjmů ve srovnání s velkými firmami.</p></section>
    <div class="grid2">
      <section class="card"><h2>TOP 20 plátců daně z příjmů 2025</h2>
        <div class="legend"><span><i style="background:var(--home)"></i>banky</span><span><i style="background:var(--est)"></i>zbrojovky</span><span><i style="background:var(--bar-muted)"></i>ostatní</span></div>
        <div class="chart" id="ch-top20-full"></div>
        <p class="note">Finanční správa zveřejňuje jen firmy, které souhlasily. <a href="${esc(D.dan_top20_zdroj)}" target="_blank" rel="noopener">Zdroj</a></p></section>
      <section class="card"><h2>Kolik z jejich zisku jde na daň</h2>
        <div class="tw"><table><thead><tr><th>Banka</th><th class="n">Zisk 2025</th><th class="n">Daň 2025</th><th class="n">Daň 2024</th><th class="n">Daň / zisk</th></tr></thead>
        <tbody>${B.map((b) => `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.nazev)}</a></td><td class="n">${mld(b.zisk["2025"])} mld.</td><td class="n">${mld(b.dan["2025"], 2)} mld.</td><td class="n">${mld(b.dan["2024"], 2)} mld.</td><td class="n">${f0.format((b.dan["2025"] / b.zisk["2025"]) * 100)} %</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Sazba daně z příjmů firem je 21 %. Poměr k čistému zisku je jen orientační: daň se platí ze zdanitelného základu a zálohami, a u UniCredit část daně připadá na Slovensko.</p>
        <h3 style="margin-top:8px">Velké firmy: zisk a daň</h3>${corpTable()}</section>
    </div>
`;
  };

  views.banky = () => `
    <section><h1>Banky</h1><p class="lead">Klikni na banku: zisk po letech, daně, dividendy a kolik z nich odešlo do zahraničí, náklady, zaměstnanci a odměny vedení.</p></section>
    <div class="banks">${D.banky.map((b) => { const [ly, le] = latest(b.zamestnanci); return `
      <a class="bank" href="#${b.id}">
        <div class="row"><h3>${esc(b.nazev)}</h3>${ownChip(b)}</div>
        <div class="small">${esc(b.vlastnik)}</div>
        ${spark(b)}
        <div class="row"><span><span class="big">${mld(b.zisk["2025"])}</span> <span class="small">mld. Kč zisk 2025</span></span><span class="small">${mld(profitSum(b))} mld. za 10 let</span></div>
        <div class="small">${b.dan["2025"] != null ? "Daň z příjmů 2025: " + mld(b.dan["2025"], 2) + " mld. Kč · " : ""}${le ? "Zaměstnanci: " + f0.format(le) + " (" + ly + ")" : "Počet zaměstnanců nedohledán"}</div>
      </a>`; }).join("")}
    </div>`;

  function bankView(b) {
    const P = payouts(b);
    const known = sum(P.map((p) => p.mld));
    const knownAbroad = b.podil_zahranici == null ? null : known * b.podil_zahranici;
    const dyear = divByProfitYear(b);
    const s10 = profitSum(b);
    const [ly, le] = latest(b.zamestnanci);
    const [py, pp] = profitPerEmployee(b);
    const [ty, tv] = latest(b.dan);
    const yoy = b.zisk["2024"] ? (b.zisk["2025"] / b.zisk["2024"] - 1) * 100 : null;
    afterRender.push(() => vbars(document.getElementById("ch-bank"), YEARS.map((y) => ({ k: y, v: b.zisk[y], v2: dyear[y] != null ? dyear[y] : null })), { unit: "mld. Kč", unit2Label: "Dividenda ze zisku:", c2: b.kapital === "zahraniční" ? "var(--abroad)" : "var(--ink)", label: "Zisk a dividendy " + b.nazev }));
    const bd = b.board;
    const tTyp = bd ? (bd.total_typ || bd.typ) : null, cTyp = bd ? bd.typ : null, pm = perMember(bd);
    const boardHtml = b.vedeni === "kb" ? kbBoardTable(true)
      : `${bd && (bd.ceo || bd.total) ? `<div class="flow">
          ${bd.ceo ? `<div class="box ${cTyp === "odhad" ? "est" : ""}"><p class="eyebrow">Generální ředitel / rok</p><p class="val">${range(bd.ceo)} mil. Kč</p><p class="note">${cTyp === "odhad" ? "Kvalifikovaný odhad" : "Zveřejněno"}</p></div>` : ""}
          ${bd.total ? `<div class="box ${tTyp === "odhad" ? "est" : ""}"><p class="eyebrow">${bd.bez_prumeru ? "Celé vedení / rok" : "Celé představenstvo / rok"}</p><p class="val">${range(bd.total, tTyp === "odhad" ? 0 : 1)} mil. Kč</p><p class="note">${tTyp === "odhad" ? "Kvalifikovaný odhad, " : "Zveřejněno ve výroční zprávě, "}${bd.clenu} členů představenstva</p></div>` : ""}
          ${pm ? `<div class="box ${tTyp === "odhad" ? "est" : ""}"><p class="eyebrow">Na jednoho člena / rok</p><p class="val">≈ ${range(pm, 0)} mil. Kč</p><p class="note">průměr, šéf bere víc než ostatní</p></div>` : ""}</div>` : ""}
        ${bd && bd.clenu ? `<p>Představenstvo má <b>${bd.clenu} členů</b>${bd.clenu_zdroj ? ` (<a href="${esc(bd.clenu_zdroj)}" target="_blank" rel="noopener">obchodní rejstřík</a>)` : ""}.</p>` : ""}
        <p class="note">${bd && bd.pozn ? esc(bd.pozn) + ". " : ""}${bd && bd.zdroj ? `<a href="${esc(bd.zdroj)}" target="_blank" rel="noopener">Zdroj</a>. ` : ""}${bd && (cTyp === "odhad" || tTyp === "odhad") ? "Odhady vycházejí ze zveřejněných odměn celých představenstev a z velikosti banky. Skutečnost se může lišit." : ""}${!bd || (!bd.ceo && !bd.total) ? "Údaje o odměnách vedení nejsou k dispozici." : ""}</p>`;
    let costHtml = "";
    if (b.naklady) {
      const ys = Object.keys(b.naklady);
      const keys = Object.keys(b.naklady[ys[ys.length - 1]]);
      costHtml = `<section class="card"><h2>Náklady</h2><div class="tw"><table><thead><tr><th>Položka</th>${ys.map((y) => `<th class="n">${y}</th>`).join("")}</tr></thead>
        <tbody>${keys.map((k) => `<tr><td>${esc(k)}</td>${ys.map((y) => `<td class="n">${mld(b.naklady[y][k], 2)} mld.</td>`).join("")}</tr>`).join("")}
        <tr><td><b>Celkem</b></td>${ys.map((y) => `<td class="n"><b>${mld(sum(Object.values(b.naklady[y])), 2)} mld.</b></td>`).join("")}</tr></tbody></table></div>
        ${b.personalni && b.zamestnanci["2025"] ? `<p class="note">Personální náklad na jednoho zaměstnance vychází v roce 2025 na ${f0.format((b.personalni["2025"] * 1e9) / b.zamestnanci["2025"] / 12)} Kč měsíčně včetně odvodů zaměstnavatele (dopočteno).</p>` : ""}</section>`;
    } else if (b.naklady_celkem) {
      costHtml = `<section class="card"><h2>Náklady</h2><p>Provozní náklady ${Object.entries(b.naklady_celkem).map(([y, v]) => y + ": <b>" + mld(v, 1) + " mld. Kč</b>").join(", ")}.</p><p class="note">${esc(b.naklady_pozn)}</p></section>`;
    }
    return `
    <a class="back" href="#banky">← Všechny banky</a>
    <nav class="switch" aria-label="Přepnout banku">${D.banky.map((x) => `<a href="#${x.id}" aria-current="${x.id === b.id}">${esc(x.zkratka)}</a>`).join("")}</nav>
    <section class="bank-head"><h1>${esc(b.nazev)}</h1><div class="meta">${ownChip(b)}<span>${esc(b.vlastnictvi)}</span></div><div class="who">${avatar(b)}<div><span class="dim">Generální ředitel</span><br><b>${esc(b.sef.jmeno)}</b>${b.sef.pozn ? ` <span class="dim">· ${esc(b.sef.pozn)}</span>` : ""}</div></div></section>
    <div class="flow">
      <div class="box"><p class="eyebrow">Vydělala 2016–2025</p><p class="val">${mld(s10)} mld.</p><p class="note">čistý zisk za 10 let</p></div>
      <div class="box tax"><p class="eyebrow">Daň z příjmů ${ty || ""}</p><p class="val">${tv == null ? "–" : mld(tv, 2) + " mld."}</p><p class="note">${tv == null ? "není v TOP 20 plátců" : b.dan_pozn ? esc(b.dan_pozn) : "uhrazeno státu (Finanční správa)"}</p></div>
      <div class="box"><p class="eyebrow">Známé dividendy</p><p class="val">${mld(known)} mld.</p><p class="note">${P.filter((p) => p.mld > 0).length === 0 ? "žádné dohledané výplaty" : plural(P.filter((p) => p.mld > 0).length, "výplata", "výplaty", "výplat") + (b.dps ? ", dopočteno" : ", jen dohledané roky")}</p></div>
      <div class="box ${b.kapital === "zahraniční" ? "out" : b.kapital === "český" ? "home" : ""}"><p class="eyebrow">Z toho do zahraničí</p><p class="val">${knownAbroad == null ? "neurčeno" : mld(knownAbroad) + " mld."}</p><p class="note">${b.kapital === "český" ? "Zisk zůstává v Česku." : b.podil_zahranici == null ? "Akcie na burze, podíl nelze určit." : b.podil_zahranici < 1 ? "Mateřská firma má " + f2.format(b.podil_zahranici * 100) + " %." : "Vše mateřské firmě (" + esc(b.zeme) + ")."}</p></div>
    </div>
    <div class="strip">
      <div class="stat"><span class="lab">Zisk 2025</span><span class="val">${mld(b.zisk["2025"])}<small>mld. Kč</small></span><span class="sub">${yoy == null ? "" : (yoy >= 0 ? "+" : "") + f1.format(yoy) + " % proti 2024"}</span></div>
      <div class="stat"><span class="lab">Zaměstnanci</span><span class="val">${le ? f0.format(le) : "–"}</span><span class="sub">${ly ? ly + (b.zam_pozn ? ", " + esc(b.zam_pozn) : "") : "nedohledáno"}</span></div>
      <div class="stat"><span class="lab">Zisk na zaměstnance</span><span class="val">${pp == null ? "–" : f1.format(pp / 1e6)}<small>${pp == null ? "" : "mil. Kč"}</small></span><span class="sub">${py ? "rok " + py : "chybí počet zaměstnanců"}</span></div>
      ${(() => { const [cy, cv] = perClient(b); return cv == null ? "" : `<div class="stat"><span class="lab">Zisk na klienta</span><span class="val">${f0.format(cv)}<small>Kč</small></span><span class="sub">${cy}, ${f1.format(b.klienti_mil)} mil. klientů${b.klienti_pozn ? " (" + esc(b.klienti_pozn) + ")" : ""}</span></div>`; })()}
      ${(() => { const [by, bv] = latest(b.pobocky); return bv ? `<div class="stat"><span class="lab">Pobočky</span><span class="val">${f0.format(bv)}</span><span class="sub">${by}</span></div>` : ""; })()}
    </div>
    <section class="card">
      <h2>Zisk a dividendy po letech</h2>
      <div class="legend"><span><i style="background:var(--home)"></i>čistý zisk</span><span><i style="background:${b.kapital === "zahraniční" ? "var(--abroad)" : "var(--ink)"}"></i>dividenda vyplacená z daného roku</span></div>
      <div class="chart" id="ch-bank"></div>
      <div class="tw"><table>
        <thead><tr><th>Rok</th><th class="n">Čistý zisk</th><th class="n">Daň z příjmů</th><th class="n">Dividenda ze zisku</th><th class="n">Do zahraničí</th><th class="n">Výnosy</th><th class="n">Zaměstnanci</th></tr></thead>
        <tbody>${YEARS.slice().reverse().map((y) => { const dv = dyear[y]; const ab = abroadOf(b, dv); const t = b.dan[y]; return `<tr>
          <td>${y}</td><td class="n">${mld(b.zisk[y], 2)}</td>
          <td class="n ${t == null ? "na" : ""}">${t == null ? "–" : mld(t, 2)}</td>
          <td class="n ${dv == null ? "na" : ""}">${dv == null ? "–" : mld(dv, 2)}</td>
          <td class="n ${ab == null ? "na" : ""}">${ab == null ? "–" : mld(ab, 2)}</td>
          <td class="n ${b.vynosy[y] == null ? "na" : ""}">${mld(b.vynosy[y], 2)}</td>
          <td class="n ${b.zamestnanci[y] == null ? "na" : ""}">${b.zamestnanci[y] == null ? "–" : f0.format(b.zamestnanci[y])}</td></tr>`; }).join("")}</tbody>
      </table></div>
      <p class="note">Mld. Kč. Daň = uhrazená daň z příjmů v daném roce (Finanční správa, jen roky v TOP 20). Dividenda je přiřazena roku, ze kterého zisku byla vyplacena. Pomlčka = údaj zatím nedohledán.</p>
    </section>
    ${(() => { const nz = (L.zpravy || []).filter((x) => x.bank === b.id), a = (L.aplikace || {})[b.id]; return `<div class="grid2"><section class="card"><div class="card-head"><h2>Zprávy o bance</h2><span class="dim">${liveStamp()}</span></div>${newsList(nz, 6)}</section>
      <section class="card"><h2>Aplikace v App Store</h2>${a ? `<div class="kv">${f2.format(a.rating)}<small>★ z 5</small></div><span class="dim">${esc(a.name)} · ${f0.format(a.count)} hodnocení · <a href="${esc(a.url)}" target="_blank" rel="noopener">App Store</a></span>` : `<p class="note">${liveStamp()}.</p>`}</section></div>`; })()}
    ${costHtml}
    ${(() => { const L = D.propousteni.filter((x) => x.banka === b.id); return L.length ? `<section class="card"><div class="card-head"><h2>Propouštění</h2><a class="cta" href="#propousteni">Všechny banky →</a></div><ul class="meth">${L.map((x) => `<li><b>${esc(x.datum)}: ${esc(x.kolik)}.</b> ${esc(x.proc)} <a href="${esc(x.zdroj)}" target="_blank" rel="noopener">Zdroj</a></li>`).join("")}</ul></section>` : ""; })()}
    <section class="card"><h2>Odměny vedení</h2>${boardHtml}</section>
    <section class="card">
      <h2>Všechny dohledané výplaty dividend</h2>
      <div class="tw"><table>
        <thead><tr><th>Ze zisku roku</th><th>Vyplaceno</th>${b.dps ? '<th class="n">Kč na akcii</th>' : ""}<th class="n">Celkem</th><th class="n">Do zahraničí</th><th>Zdroj</th></tr></thead>
        <tbody>${P.map((p) => { const ab = abroadOf(b, p.mld); return `<tr><td>${esc(p.ze_zisku)}</td><td>${esc(p.vyplaceno)}</td>${b.dps ? `<td class="n">${f2.format(p.kc)}</td>` : ""}
          <td class="n">${mld(p.mld, 2)} mld.${p.dopocteno ? ' <span class="est">dopočteno</span>' : ""}</td>
          <td class="n">${ab == null ? "–" : mld(ab, 2) + " mld."}</td><td><a href="${esc(p.zdroj)}" target="_blank" rel="noopener">odkaz</a></td></tr>`; }).join("")}</tbody>
      </table></div>
      ${b.dps ? `<p class="note">Celková částka = dividenda na akcii × ${f0.format(b.akcie)} akcií.</p>` : ""}
    </section>
    <section class="card"><h2>Zdroje</h2><ul class="sources">${b.zdroje.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 90))}</a></li>`).join("")}</ul></section>`;
  }

  function kbBoardTable(inBank) {
    const ys = ["2021", "2022", "2023", "2024", "2025"];
    const kb = bankById.kb, ceo = D.kb_vedeni[0].r["2025"], avg = kb.prumerna_odmena["2025"];
    return `${inBank ? `<p>Šéf banky Jan Juchelka dostal za rok 2025 celkem <b>${f1.format(ceo / 1e6)} mil. Kč</b>, ${f0.format(ceo / avg)}× víc než průměrný zaměstnanec KB (${f1.format(avg / 1e6)} mil. Kč ročně).</p>` : ""}
      <div class="tw"><table><thead><tr><th>Člen představenstva</th><th>Oblast</th>${ys.map((y) => `<th class="n">${y}</th>`).join("")}</tr></thead>
      <tbody>${D.kb_vedeni.map((m) => `<tr><td>${esc(m.clen)}</td><td class="dim">${esc(m.role)}</td>${ys.map((y) => `<td class="n ${m.r[y] == null ? "na" : ""}">${m.r[y] == null ? "–" : f1.format(m.r[y] / 1e6)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="note">Mil. Kč, celková vyplacená odměna: fixní plat, bonusy včetně odložených, benefity a penzijní příspěvek. Zdroj: zpráva o odměňování KB za rok 2025.</p>`;
  }

  views.dividendy = () => {
    const s = D.sektor;
    const all = [];
    D.banky.forEach((b) => payouts(b).forEach((p) => all.push({ b, p })));
    all.sort((a, c) => String(c.p.vyplaceno).localeCompare(String(a.p.vyplaceno)));
    const totAbroad = sum(all.map(({ b, p }) => abroadOf(b, p.mld)));
    const yrs6 = Object.keys(s.dividendy_velka6);
    afterRender.push(() => vbars(document.getElementById("ch-div6"), yrs6.map((y) => ({ k: y, v: s.dividendy_velka6[y], c: "var(--abroad)" })), { unit: "mld. Kč", label: "Dividendy šesti největších bank" }));
    return `
    <section><h1>Dividendy do zahraničí</h1>
      <p class="lead">V roce 2024 odešlo z bank a pojišťoven v Česku do zahraničí na dividendách <b>${mld(s.dividendy_banky_pojistovny["2024"])} mld. Kč</b>, rok předtím ${mld(s.dividendy_banky_pojistovny["2023"])} mld. Kč. To je víc než třetina všech dividend, které z Česka odtékají.</p></section>
    <div class="grid2">
      <section class="card"><h2>Šest největších bank: dividendy matkám</h2><p class="note">Mld. Kč podle roku výplaty. Novější řadu jen za banky ČNB samostatně nezveřejňuje.</p><div class="chart" id="ch-div6"></div></section>
      <section class="card"><h2>Proč se liší</h2><ul class="meth">
        <li>ČS, ČSOB, UniCredit a Raiffeisenbank mají jediného zahraničního vlastníka, takže celá dividenda odchází z Česka.</li>
        <li>U KB dostává Société Générale ${f2.format(bankById.kb.podil_zahranici * 100)} %, zbytek jde akcionářům na burze, z velké části českým.</li>
        <li>Moneta je kótovaná a nejvíc akcií drží PPF. Kolik dividend odchází do zahraničí, z veřejných dat určit nejde.</li>
        <li>Fio banka vyplácí dividendy českým vlastníkům (2024 a 2025 po zhruba 3 mld. Kč), peníze zůstávají v Česku. V letech 2020 a 2021 ČNB kvůli covidu výplaty dividend omezila.</li></ul></section>
    </div>
    <section class="card"><h2>Všechny dohledané výplaty</h2>
      <p class="note">Součet dohledaných částek, které odešly do zahraničí: <b style="color:var(--abroad)">${mld(totAbroad)} mld. Kč</b>. Skutečná suma je vyšší, protože u ČS, ČSOB, UniCredit a Raiffeisenbank chybí většina let.</p>
      <div class="tw"><table><thead><tr><th>Banka</th><th>Ze zisku roku</th><th>Vyplaceno</th><th class="n">Celkem</th><th class="n">Do zahraničí</th></tr></thead>
      <tbody>${all.map(({ b, p }) => { const ab = abroadOf(b, p.mld); return `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.nazev)}</a></td><td>${esc(p.ze_zisku)}</td><td>${esc(p.vyplaceno)}</td><td class="n">${mld(p.mld, 2)} mld.${p.dopocteno ? ' <span class="est">dopočteno</span>' : ""}</td><td class="n">${ab == null ? "neurčeno" : mld(ab, 2) + " mld."}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  };

  views.mzdy = () => {
    const W = D.mzdy.slice().sort((a, b) => b.eur - a.eur);
    const kb = bankById.kb, cz = D.mzdy.find((w) => w.zeme === "Česko");
    const boards = D.banky.filter((b) => b.board && (b.board.ceo || b.board.total));
    const ceos = boards.filter((b) => b.board.ceo);
    afterRender.push(() => {
      hbars(document.getElementById("ch-wage"), W.map((w) => ({ k: w.zeme, v: w.eur, c: w.zeme === "Česko" ? "var(--home)" : "var(--bar-muted)", note: w.pozn + ", " + w.obdobi })), { unit: "€ hrubého měsíčně", fmt: (v) => f0.format(v) + " €", label: "Mzdy ve finančnictví v eurech" });
      hbars(document.getElementById("ch-ceo"), ceos.map((b) => ({ k: b.zkratka, v: (b.board.ceo[0] + b.board.ceo[1]) / 2, c: b.board.typ === "odhad" ? "var(--est)" : "var(--abroad)", note: b.board.typ === "odhad" ? "odhad " + range(b.board.ceo) + " mil. Kč" : "zveřejněno" })).sort((a, b) => b.v - a.v), { unit: "mil. Kč ročně", fmt: (v) => f0.format(v), label: "Odměny šéfů bank" });
    });
    return `
    <section><h1>Mzdy a odměny</h1>
      <p class="lead">Zaměstnanec českého finančnictví bere v průměru <b>${esc(cz.mistni)}</b> hrubého měsíčně (${esc(cz.obdobi)}), ${f1.format(cz.eur / cz.prumer_eur)}× víc než průměr ekonomiky. Šéfové velkých bank berou desítky milionů ročně.</p></section>
    <div class="grid2">
      <section class="card"><h2>Kolik berou šéfové bank</h2>
        <div class="legend"><span><i style="background:var(--abroad)"></i>zveřejněno</span><span><i style="background:var(--est)"></i>odhad (střed rozpětí)</span></div>
        <div class="chart" id="ch-ceo" style="min-height:160px"></div>
        <div class="tw"><table><thead><tr><th>Banka</th><th class="n">Šéf / rok</th><th class="n">Představenstvo / rok</th></tr></thead>
        <tbody>${boards.map((b) => `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.nazev)}</a></td><td class="n">${boardCell(b, "ceo")}</td><td class="n">${boardCell(b, "total")}<br><span class="dim">${b.board.bez_prumeru ? "vč. dozorčí rady a vrcholného vedení" : b.board.clenu + " členů"}${(() => { const pm = perMember(b.board); return pm ? " · ≈ " + range(pm, 0) + " mil./člen" : ""; })()}</span></td></tr>`).join("")}</tbody></table></div>
        <p class="note">Celé představenstvo: KB, ČS, ČSOB (vč. dozorčí rady), Raiffeisenbank a Moneta podle výročních zpráv 2025. Odměnu šéfa zveřejňují jen KB a Moneta (média), u ostatních je odhad. Počet členů podle obchodního rejstříku (2026); „na člena“ je prostý průměr, šéf obvykle bere 2–3× víc než ostatní.</p></section>
      <section class="card"><h2>Průměrná mzda ve finančnictví (v eurech)</h2><p class="note">Hrubá <b>měsíční</b> mzda v sekci finance a pojišťovnictví, <b>přepočtená na eura</b>, aby šly země porovnat. Původní částka v místní měně je v tabulce. Roky a metodiky se liší, srovnání je orientační.</p><div class="chart" id="ch-wage" style="min-height:170px"></div>
        <div class="tw"><table><thead><tr><th>Země</th><th class="n">€ měsíčně</th><th>V místní měně</th><th>Období</th><th class="n">× průměr</th></tr></thead>
        <tbody>${W.map((w) => `<tr><td>${esc(w.zeme)}</td><td class="n">${f0.format(w.eur)} €</td><td>${esc(w.mistni)}</td><td class="dim">${esc(w.obdobi)}</td><td class="n ${w.prumer_eur ? "" : "na"}">${w.prumer_eur ? f1.format(w.eur / w.prumer_eur) + "×" : "–"}</td></tr>`).join("")}</tbody></table></div>
        <p class="note">× průměr = mzda ve finančnictví ÷ mzda v celé ekonomice téže země. ${W.filter((w) => w.prumer_pozn).map((w) => esc(w.zeme) + ": " + esc(w.prumer_pozn)).join(". ")}.</p></section>
    </div>
    <section class="card"><h2>Komerční banka: jediná zveřejňuje průměrnou odměnu</h2>
      <p>Průměrná odměna zaměstnance KB byla v roce 2025 <b>${f0.format(kb.prumerna_odmena["2025"])} Kč</b> ročně, asi ${f0.format(kb.prumerna_odmena["2025"] / 12)} Kč měsíčně včetně bonusů. Personální náklad na zaměstnance vč. odvodů zaměstnavatele: ${f0.format((kb.personalni["2025"] * 1e9) / kb.zamestnanci["2025"] / 12)} Kč měsíčně.</p></section>
    <section class="card"><h2>Představenstvo Komerční banky 2021–2025</h2>${kbBoardTable(false)}</section>`;
  };

  views.sazby = () => {
    const F = D.sektor.ferovost, cb = F.cz_banka, eb = F.ea_banka;
    const gap = (r, zone) => r.typ === "vklad" ? (zone === "cz" ? cb - r.cz : eb - r.ea) : (zone === "cz" ? r.cz - cb : r.ea - eb);
    const R = F.radky, cur = F.jen_cz.find((x) => x[0] === "Běžný účet")[1];
    const mort = R.find((r) => r.k === "Nová hypotéka"), dep = R[0];
    const ex = 200000;
    afterRender.push(() => hbars(document.getElementById("ch-fer"), R.map((r) => ({ k: r.k, cz: gap(r, "cz"), ea: gap(r, "ea") })), { unit: "p. b.", fmt: (v) => f2.format(v), series: [{ key: "cz", c: "var(--abroad)", name: "Česko" }, { key: "ea", c: "var(--bar-muted)", name: "Eurozóna" }], label: "Marže bank vůči centrální bance" }));
    const p2 = (v) => f2.format(v) + " %";
    const IX = D.sektor.index.rady, last = IX[IX.length - 1], prev = IX[IX.length - 2], first = IX[0];
    const gapOf = (r) => r[1] - r[2];
    const dGap = gapOf(last) - gapOf(prev);
    afterRender.push(() => vbars(document.getElementById("ch-index"), IX.map((r) => ({ k: r[0], v: gapOf(r), c: "var(--abroad)", note: "ČNB " + f2.format(r[1]) + " % · vklady " + f2.format(r[2]) + " %" })), { unit: "p. b.", fmt: (v) => f1.format(v), label: "Index férovosti vkladů", h: 210 }));
    const offers = F.nabidky.map((n) => ({ b: n[0], v: parseFloat(n[1].replace(",", ".")), txt: n[1], pozn: n[2] })).sort((a, c) => c.v - a.v);
    const omax = Math.max(...offers.map((o) => o.v), cb);
    return `
    <section><span class="eyebrow">Mění se každý měsíc · data za ${esc(F.obdobi)}</span><h1>Jsou sazby bank férové?</h1>
      <p class="lead">Krátká odpověď: <b>úvěry jsou zhruba férové</b>, české banky si nad sazbou centrální banky berou podobně jako banky v eurozóně. <b>Nevýhodné je nechat peníze ležet</b>: běžný účet nese ${p2(cur)}, zatímco banka si stejné peníze může uložit u ČNB za ${p2(cb)}.</p></section>
    <div class="facts">
      <div class="fact home"><span class="fh">Hypotéky: v pořádku.</span> Nová hypotéka (${p2(mort.cz)}) je o ${f2.format(mort.cz - cb)} p. b. nad sazbou ČNB. V eurozóně je to ${f2.format(mort.ea - eb)} p. b.</div>
      <div class="fact"><span class="fh">Peníze na účtu: nevýhoda pro klienta.</span> ${f0.format(ex)} Kč na běžném účtu vám vynese ${f0.format(ex * cur / 100)} Kč ročně. U ČNB by za ně banka dostala ${f0.format(ex * cb / 100)} Kč.</div>
      <div class="fact tax"><span class="fh">Kontokorent a kreditka: nejdražší.</span> ${p2(F.jen_cz[1][1])} a ${p2(F.jen_cz[2][1])}, víc než trojnásobek hypotéky.</div>
    </div>
    <section class="card"><div class="card-head"><h2>Index férovosti vkladů</h2><span class="dim">aktualizace každý měsíc</span></div>
      <div class="grid2" style="margin:0">
        <div><p class="big-stat"><b style="color:var(--abroad)">${f2.format(gapOf(last))} p. b.</b> o tolik méně dostanete na vkladech na požádání, než za kolik si banka uloží peníze u ČNB (${esc(F.obdobi)}).</p>
          <p>Proti předchozímu měření ${dGap > 0 ? "<b>horší o " + f2.format(dGap) + " p. b.</b>" : dGap < 0 ? "<b>lepší o " + f2.format(-dGap) + " p. b.</b>" : "beze změny."} Čím nižší číslo, tím férovější.</p>
          <p class="note">Když ČNB v polovině roku 2023 držela sazbu ${f2.format(first[1])} %, banky na těchto vkladech platily ${f2.format(first[2])} %. Teď je sazba ČNB ${f2.format(last[1])} % a vklady nesou ${f2.format(last[2])} %. Sazba na vkladech se skoro nehýbe, ať ČNB sazby zvedá, nebo snižuje. Běžné účty nesou celou dobu 0,1–0,3 %.</p></div>
        <div><div class="chart" id="ch-index"></div><p class="note">Index = 2T repo sazba ČNB − průměrná sazba nových vkladů domácností na požádání (ČNB). Výběr měsíců, ${esc(D.sektor.index.pozn.toLowerCase())}.</p></div>
      </div></section>
    <div class="grid2">
      <section class="card"><h2>Kolik si banka bere: Česko vs. eurozóna</h2>
        <div class="legend"><span><i style="background:var(--abroad)"></i>Česko</span><span><i style="background:var(--bar-muted)"></i>eurozóna</span></div>
        <div class="chart" id="ch-fer"></div>
        <p class="note">Procentní body. U vkladů: o kolik méně banka platí klientovi, než je sazba centrální banky. U úvěrů: o kolik víc si účtuje. Čím delší pruh, tím víc banka vydělává.</p></section>
      <section class="card"><h2>Sazby vedle sebe</h2>
        <div class="tw"><table><thead><tr><th>Produkt</th><th class="n">Česko</th><th class="n">Eurozóna</th></tr></thead><tbody>
          <tr class="hl"><td>Sazba centrální banky<br><span class="dim">${esc(F.cz_banka_nazev)} / ${esc(F.ea_banka_nazev)}</span></td><td class="n">${p2(cb)}</td><td class="n">${p2(eb)}</td></tr>
          ${R.map((r) => `<tr><td>${esc(r.k)}</td><td class="n">${p2(r.cz)}</td><td class="n">${p2(r.ea)}</td></tr>`).join("")}
          ${F.jen_cz.map((x) => `<tr><td>${esc(x[0])}</td><td class="n">${p2(x[1])}</td><td class="n na">–</td></tr>`).join("")}
        </tbody></table></div>
        <p class="note">Průměry nových obchodů domácností za ${esc(F.obdobi)}.${F.ea_obdobi && F.ea_obdobi !== F.obdobi ? ` Sazby eurozóny jsou za ${esc(F.ea_obdobi)}.` : ""} Vklady na požádání zahrnují běžné i spořicí účty. Eurozóna samostatnou sazbu běžných účtů, kontokorentů a karet v této statistice nemá. Nabídková sazba hypoték podle Hypoindexu byla v ${esc(F.hypoindex.mesic)} ${p2(F.hypoindex.sazba)}. <a href="${esc(F.zdroje.cz)}" target="_blank" rel="noopener">ČNB</a> · <a href="${esc(F.zdroje.ea)}" target="_blank" rel="noopener">ECB</a> · <a href="${esc(F.zdroje.cnb)}" target="_blank" rel="noopener">repo ČNB</a> · <a href="${esc(F.zdroje.ecb)}" target="_blank" rel="noopener">sazby ECB</a> · <a href="${esc(F.hypoindex.zdroj)}" target="_blank" rel="noopener">Hypoindex</a></p></section>
    </div>
    <section class="card"><div class="card-head"><h2>Žebříček spořicích účtů</h2><span class="dim">stav k ${esc(F.nabidky_datum)}</span></div>
      <p>Průměrně banky na vkladech na požádání platí <b>${p2(dep.cz)}</b>. Nejlepší nabídky velkých bank jsou přitom 2,6–5,2 %. Rozdíl dělají peníze, které lidé nechávají na běžném účtu nebo nad limitem a bez splněných podmínek.</p>
      <div class="tw"><table><thead><tr><th>#</th><th>Banka</th><th class="n">Nejvyšší sazba</th><th>Podmínka / limit</th></tr></thead>
      <tbody>${offers.map((o, i) => `<tr><td class="rank">${i + 1}</td><td>${esc(o.b)}</td><td class="n"><span class="bar-cell"><span class="b ${o.v >= cb ? "" : "out"}" style="width:${Math.round((o.v / omax) * 60)}px"></span>${esc(o.txt)}</span></td><td class="dim">${esc(o.pozn || "podle podmínek banky")}</td></tr>`).join("")}
        <tr class="hl"><td></td><td>Průměr, který lidé skutečně dostávají</td><td class="n">${p2(dep.cz)}</td><td class="dim">vklady na požádání, ČNB</td></tr>
        <tr class="hl"><td></td><td>Sazba ČNB pro banky</td><td class="n">${p2(cb)}</td><td class="dim">2T repo</td></tr></tbody></table></div>
      <p class="note">Stav k ${esc(F.nabidky_datum)} podle srovnávače, sazby před zdaněním a často jen při splnění podmínek (aktivní účet, platby kartou, limit vkladu). Ověřujte u banky. <a href="${esc(F.zdroje.nabidky)}" target="_blank" rel="noopener">Zdroj</a></p></section>`;
  };

  views.propousteni = () => {
    const P = D.sektor.pobocky, L = D.propousteni.slice().sort((a, c) => c.rok.localeCompare(a.rok)), Z = D.sektor.zamestnanci, K = D.sektor.kb_2026;
    const py = Object.keys(P.rady), p0 = P.rady[py[0]], p1 = P.rady[py[py.length - 1]];
    const zy = Object.keys(Z);
    afterRender.push(() => vbars(document.getElementById("ch-pob"), py.map((y) => ({ k: y, v: P.rady[y], c: "var(--bar-muted)", note: y === "2020" ? "konec 1. pololetí" : "" })), { unit: "poboček", fmt: (v) => f0.format(v), label: "Bankovní pobočky v Česku", h: 210 }));
    const withBr = D.banky.filter((b) => b.pobocky && Object.keys(b.pobocky).length);
    return `
    <section><h1>Propouštění a rušení poboček</h1>
      <p class="lead">Od roku 2013 zmizelo <b>${f0.format(p0 - p1)} bankovních poboček</b> (${f0.format(((p0 - p1) / p0) * 100)} %). Banky propouštějí ve vlnách, nejčastěji kvůli digitalizaci a tlaku zahraničních vlastníků na ziskovost. Často v letech rekordních zisků.</p></section>
    <div class="strip">
      <div class="stat"><span class="lab">Pobočky ${py[0]} → ${py[py.length - 1]}</span><span class="val">${f0.format(p0)} → ${f0.format(p1)}</span><span class="sub">ČNB</span></div>
      <div class="stat"><span class="lab">Lidé v bankách ${zy[0]} → ${zy[zy.length - 1]}</span><span class="val">${f0.format(Z[zy[0]])} → ${f0.format(Z[zy[zy.length - 1]])}</span><span class="sub">celý sektor</span></div>
      <div class="stat"><span class="lab">KB, ${esc(K.obdobi)}</span><span class="val">−${f1.format((1 - K.zamestnanci / K.rok_pred) * 100)} %</span><span class="sub">${f0.format(K.zamestnanci)} lidí, rok předtím ${f0.format(K.rok_pred)}</span></div>
    </div>
    <section class="card"><h2>Vlny propouštění 2018–2026</h2>
      <div class="tw"><table><thead><tr><th>Kdy</th><th>Banka</th><th>Kolik</th><th>Proč</th><th>Zdroj</th></tr></thead>
      <tbody>${L.map((x) => { const b = bankById[x.banka]; return `<tr><td>${esc(x.datum)}</td><td><a class="name" href="#${b.id}">${esc(b.zkratka)}</a></td><td><b>${esc(x.kolik)}</b></td><td class="dim">${esc(x.proc)}</td><td><a href="${esc(x.zdroj)}" target="_blank" rel="noopener">odkaz</a></td></tr>`; }).join("")}</tbody></table></div>
      <p class="note">Podle médií (E15, Seznam Zprávy, Investice.cz) a výsledků bank. Banky přesná čísla často neříkají, proto „stovky“. Část úbytku jde přirozenými odchody, ne výpověďmi. Pro srovnání: ${esc(D.propousteni_kontext.text)} <a href="${esc(D.propousteni_kontext.zdroj)}" target="_blank" rel="noopener">Zdroj</a></p></section>
    <div class="grid2">
      <section class="card"><h2>Pobočky celého sektoru</h2><div class="chart" id="ch-pob"></div><p class="note">${esc(P.pozn)}. ${P.zdroje.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">zdroj ${i + 1}</a>`).join(" · ")}</p></section>
      <section class="card"><h2>Pobočky po bankách</h2>
        <div class="tw"><table><thead><tr><th>Banka</th><th class="n">Dřív</th><th class="n">Teď</th><th class="n">Změna</th></tr></thead>
        <tbody>${withBr.map((b) => { const ys = Object.keys(b.pobocky); const a = ys[0], z = ys[ys.length - 1]; let now = b.pobocky[z], nowY = z; if (b.id === "kb") { now = K.pobocky; nowY = "VI/2026"; } const ch = ys.length > 1 || b.id === "kb" ? now - b.pobocky[a] : null; return `<tr class="link" data-go="${b.id}"><td><a class="name" href="#${b.id}">${esc(b.nazev)}</a></td><td class="n">${ys.length > 1 || b.id === "kb" ? f0.format(b.pobocky[a]) + ' <span class="dim">(' + a + ")</span>" : "–"}</td><td class="n">${f0.format(now)} <span class="dim">(${nowY})</span></td><td class="n">${ch == null ? "–" : f0.format(ch) + " (" + f0.format((ch / b.pobocky[a]) * 100) + " %)"}</td></tr>`; }).join("")}</tbody></table></div>
        <p class="note">Raiffeisenbank v roce 2022 převzala Equa bank, proto její síť neklesá tolik. Fio a UniCredit čísla v těchto zdrojích nemají.</p></section>
    </div>`;
  };

  const contact = () => (D.kontakt ? `<a href="mailto:${esc(D.kontakt)}">${esc(D.kontakt)}</a>` : "kontaktní e-mail doplníme");
  views.onas = () => `
    <section><h1>O projektu</h1>
      <p class="lead">Kam tečou zisky bank je nezávislý přehled českého bankovnictví. Na jednom místě ukazuje, kolik banky vydělávají, kolik zaplatí na daních, kolik pošlou vlastníkům, kolik berou jejich vedení a jaké sazby dávají klientům.</p></section>
    <div class="grid2">
      <section class="card"><h2>Proč</h2>
        <p>Silné a ziskové banky jsou pro ekonomiku každé země důležité. Půjčují firmám i lidem, drží úspory a ustojí krize. Zisky jim nezávidíme.</p>
        <p>S bankou je ale člověk často celý život: první účet, hypotéka, spoření na důchod. Čísla o tom, jak si jeho banka vede, jsou přitom rozházená ve výročních zprávách, tiskových zprávách a statistikách ČNB. Tady jsou pohromadě a srozumitelně.</p></section>
      <section class="card"><h2>Pro koho</h2>
        <ul class="meth">
          <li><b>Klienti</b>: aby viděli, jak si jejich banka stojí, a rozhodovali se podle čísel, ne podle reklamy.</li>
          <li><b>Zaměstnanci bank</b>: aby měli přehled, jak si jejich banka vede v kontextu trhu: zisky, odměny vedení, počty lidí a poboček, propouštění.</li>
          <li><b>Novináři a veřejnost</b>: všechna čísla mají zdroj a dají se ověřit.</li>
        </ul></section>
    </div>
    <div class="grid2">
      <section class="card"><h2>Data</h2>
        <ul class="meth">
          <li>Jen veřejné zdroje: výroční zprávy bank, ČNB, Finanční správa, ČSÚ, ECB a velká média. U každého čísla je odkaz.</li>
          <li>Odhady jsou vždy označené fialově a vysvětlené v <a href="#metodika">metodice</a>.</li>
          <li>Sazby a index férovosti aktualizujeme každý měsíc, výsledky bank čtvrtletně.</li>
        </ul></section>
      <section class="card"><h2>Nezávislost a opravy</h2>
        <ul class="meth">
          <li>Projekt není spojený s žádnou bankou, politickou stranou ani zadavatelem. Nemá reklamu ani placené články.</li>
          <li>Našli jste chybu nebo novější číslo? Napište na ${contact()}. Opravy zveřejňujeme s datem.</li>
        </ul></section>
    </div>`;

  views.soukromi = () => `
    <section><h1>Ochrana soukromí</h1><p class="lead">Krátce: nesbíráme o vás žádné osobní údaje.</p></section>
    <section class="card"><ul class="meth">
      <li><b>Žádné účty, formuláře ani newsletter.</b> Web po vás nic nechce a nic si o vás neukládá.</li>
      <li><b>Žádné sledovací cookies ani analytika.</b> Nepoužíváme Google Analytics, Facebook Pixel ani podobné nástroje. Pokud bychom v budoucnu měření návštěvnosti přidali, spustí se jen po vašem souhlasu v cookie liště.</li>
      <li><b>Cookie lišta.</b> Vaši volbu (přijmout / odmítnout) si pamatujeme v úložišti vašeho prohlížeče, abychom se neptali znovu. Změnit ji můžete kdykoli odkazem „Nastavení cookies“ v patičce.</li>
      <li><b>Hosting.</b> Poskytovatel hostingu může jako každý webový server krátkodobě zaznamenávat technické údaje (IP adresa, čas, prohlížeč) kvůli bezpečnosti a provozu. My je nevyhodnocujeme.</li>
      <li><b>Žádné služby třetích stran.</b> Písma i všechny soubory se načítají přímo z tohoto webu, nic se neposílá Googlu ani jiným firmám.</li>
      <li><b>Osoby na webu.</b> Jména a odměny členů vedení bank pocházejí z dokumentů, které banky musí zveřejňovat (zprávy o odměňování, výroční zprávy, obchodní rejstřík). Fotografie nepoužíváme. Pokud se vás údaj týká a je nepřesný, opravíme ho.</li>
      <li><b>Kontakt:</b> ${contact()}.</li>
    </ul><p class="note">Platné od ${esc(D.aktualizace)}.</p></section>`;

  views.podminky = () => `
    <section><h1>Podmínky užití</h1><p class="lead">Web slouží k informování. Nejde o investiční, finanční ani právní poradenství.</p></section>
    <section class="card"><ul class="meth">
      <li><b>Informace, ne rada.</b> Údaje nejsou doporučením koupit, prodat nebo změnit jakýkoli finanční produkt či akcii. Před rozhodnutím si podmínky ověřte přímo u banky.</li>
      <li><b>Přesnost.</b> Čísla pečlivě přebíráme z veřejných zdrojů, ale můžou obsahovat chyby nebo být zastaralá. Odhady jsou označené. Za rozhodnutí učiněná na základě webu neodpovídáme.</li>
      <li><b>Zdroje.</b> Práva k původním dokumentům mají jejich autoři (banky, ČNB, ČSÚ, média). Odkazujeme na ně u každého čísla.</li>
      <li><b>Sdílení.</b> Grafy a čísla z webu můžete volně sdílet a citovat s uvedením zdroje „Kam tečou zisky bank“.</li>
      <li><b>Názvy bank</b> používáme jen k identifikaci. Web není s žádnou bankou spojený ani jí schválený.</li>
      <li><b>Změny.</b> Obsah i tyto podmínky můžeme kdykoli upravit.</li>
    </ul><p class="note">Platné od ${esc(D.aktualizace)}.</p></section>`;

  views.metodika = () => `
    <section><h1>Metodika a zdroje</h1><p class="lead">Jak jsou čísla posbíraná, co znamenají a co je odhad.</p></section>
    <section class="card"><h2>Co je čím</h2><ul class="meth">
      <li><b>Živé počítadlo</b>: roční částka rozpočítaná na sekundy od 1. 1. 2026 podle tempa posledního známého roku. Není to skutečný průběžný údaj.</li>
      <li><b>Čistý zisk</b>: konsolidovaný zisk po zdanění. 2016–2018 z výročních zpráv (Finance.cz), 2019–2020 Podnikatel.cz, 2021–2025 souhrn ČTK.</li>
      <li><b>Daň z příjmů</b>: daň z příjmů právnických osob uhrazená v daném roce podle žebříčku Finanční správy (jen firmy v TOP 20, které souhlasily se zveřejněním).</li>
      <li><b>Dividendy</b>: u KB a Monety dopočtené z dividendy na akcii × počet akcií. U ostatních bank jen roky, kde výši uvedla banka nebo média.</li>
      <li><b>Do zahraničí</b>: dividenda × podíl zahraničního vlastníka.</li>
      <li><b>Odměny vedení</b>: celé představenstvo KB, ČS, ČSOB, Raiffeisenbank a Moneta z výročních zpráv a zpráv o odměňování 2025, u Fio celé vedení. Šéf Monety z médií. Ostatní banky jsou <b>kvalifikovaný odhad</b>: ČS a ČSOB jsou podobně velké jako KB a mají stejná regulatorní pravidla, u menších UniCredit a Raiffeisenbank je rozpětí posunuté níž. Počet členů představenstva je z obchodního rejstříku. Odhady jsou označené fialově.</li>
      <li><b>Úroková marže</b>: průměrné sazby ČNB u nových obchodů domácností za poslední zveřejněný měsíc; úrokové výnosy a úrokový zisk sektoru ze Zprávy o finanční stabilitě ČNB. Tato čísla se mění každý měsíc.</li>
      <li><b>Férové sazby</b>: sazby ČNB a ECB za stejný měsíc. Od sazeb klientů se odečítá sazba centrální banky (ČNB 2T repo, ECB depozitní sazba), protože za ni si banky mohou peníze uložit nebo je na trhu získat. Fixované hypotéky banky financují spíš za tržní swapové sazby, srovnání je proto zjednodušené. Nabídky spořicích účtů ze srovnávače Ušetřeno.cz, ověřujte u banky.</li>
      <li><b>Index férovosti vkladů</b>: 2T repo sazba ČNB minus průměrná sazba nových vkladů domácností na požádání podle ČNB. Repo sazba je ta, která platila většinu daného měsíce.</li>
      <li><b>Propouštění</b>: oznámení bank citovaná v médiích (E15, Seznam Zprávy, Investice.cz) a čísla z výsledků bank. Jde o plánované snížení míst, ne vždy o výpovědi.</li>
      <li><b>Zisk na klienta</b>: čistý zisk banky ÷ počet klientů za stejný rok. Banky klienty počítají různě (aktivní/všichni, banka/skupina), srovnání je orientační.</li>
      <li><b>Komu patří bankovnictví</b>: aktiva pěti bank zahraničních skupin ÷ aktiva celého sektoru (ČNB) ke konci roku. Jde o spodní odhad zahraničního podílu.</li>
      <li><b>Daň průměrného zaměstnance</b>: 15 % z průměrné hrubé mzdy 2025 minus sleva na poplatníka, bez pojištění.</li>
      <li><b>Mzdy v zahraničí</b>: národní statistické úřady. Česko a Polsko přepočteny průměrným kurzem 2025.</li>
    </ul></section>
    <section class="card"><h2>Automaticky aktualizovaná data</h2><ul class="meth">
      <li><b>Zprávy o bankách</b>: každý den automatický výběr titulků z českých médií přes vyhledávání Google News (RSS) za posledních 30 dní, nejvýš 80 zpráv. Berou se jen titulky, které banku jmenují. Stejné titulky se slučují. Web zobrazuje jen titulek, médium a odkaz na původní článek. Výběr neprochází ruční kontrolou a nevyjadřuje názor webu.</li>
      <li><b>Hodnocení aplikací</b>: průměrné hodnocení hlavní mobilní aplikace banky v českém App Store (veřejné rozhraní iTunes Search API), každý den. Aplikace je pevně určená (ověřeno podle prodejce), firemní a vedlejší aplikace (klíče, pojištění) se nepočítají. Trend je rozdíl proti nejstaršímu uloženému dni, nejvýš 90 dní zpět. Hodnocení v Google Play nemá veřejné rozhraní, proto chybí.</li>
      <li><b>Repo sazba ČNB</b>: denně z veřejného přehledu vývoje 2T repo sazby na webu ČNB.</li>
      <li><b>Úrokové sazby a index férovosti</b>: jednou měsíčně z databáze ČNB ARAD (úrokové sazby měnových finančních institucí, nové obchody domácností). Sazby konkrétních spořicích účtů se doplňují ručně ze srovnávače.</li>
      <li>Když některý zdroj nefunguje, zůstanou na webu poslední platná data s datem aktualizace.</li>
    </ul></section>
    <section class="card"><h2>Co chybí</h2><ul class="meth">
      <li>Dividendy ČS, ČSOB, UniCredit a Raiffeisenbank za roky 2016–2022 (starší výroční zprávy).</li>
      <li>Odměny představenstva UniCredit (banka je samostatně nezveřejňuje) a jednotlivé odměny šéfů ČS, ČSOB, UniCredit a Raiffeisenbank.</li>
      <li>Počet zaměstnanců ČSOB a Fio skupiny.</li>
    </ul><p class="note">Data jsou v souboru data.js, po doplnění se stránka přepočítá sama.</p></section>`;

  /* ---------- cookie lišta ---------- */
  const CK = "kzb-consent";
  const getConsent = () => { try { return localStorage.getItem(CK); } catch (e) { return null; } };
  const setConsent = (v) => { try { localStorage.setItem(CK, v); } catch (e) {} };
  function cookieBar(force) {
    const bar = document.getElementById("cookies");
    if (!bar) return;
    if (!force && getConsent()) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.onclick = (e) => {
      const b = e.target.closest("button[data-c]"); if (!b) return;
      setConsent(b.dataset.c); bar.hidden = true;
      if (b.dataset.c === "all" && typeof window.onConsent === "function") window.onConsent();
    };
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); cookieBar(true); } });
  cookieBar(false);
  if (getConsent() === "all" && typeof window.onConsent === "function") window.onConsent();

  /* ---------- router ---------- */
  function render() {
    const h = (location.hash || "#prehled").slice(1);
    const bank = bankById[h];
    const key = bank ? "banky" : (views[h] ? h : "prehled");
    afterRender.length = 0;
    clearInterval(tickTimer);
    app.innerHTML = bank ? bankView(bank) : views[key]();
    document.querySelectorAll("#nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.view === key ? "page" : "false"));
    document.title = (bank ? bank.nazev + " · " : "") + "Kam tečou zisky bank";
    afterRender.forEach((f) => f());
    app.querySelectorAll("tr[data-go]").forEach((tr) => tr.addEventListener("click", (e) => { if (e.target.tagName !== "A") location.hash = tr.dataset.go; }));
    hideTip();
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  let rt, lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(render, 150); });
  document.getElementById("upd").textContent = "Data aktualizována " + D.aktualizace + ".";
  render();
})();

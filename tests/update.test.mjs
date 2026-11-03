// Testy parserů živých dat na vzorových vstupech. Spuštění: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { parseNews, mergeNews, pickApp, parseRepo, addHistory } from "../scripts/update.mjs";

const NOW = Date.parse("2026-11-03T08:00:00Z");
const rss = (items) => `<rss><channel>${items.map(([t, s, d, l]) => `<item><title>${t}</title><link>${l}</link><pubDate>${d}</pubDate><source url="https://x.cz">${s}</source></item>`).join("")}</channel></rss>`;

test("parseNews: odstraní zdroj z titulku, dekóduje entity, vyřadí staré", () => {
  const xml = rss([
    ["Banka zvýšila sazby &amp; poplatky - Deník", "Deník", "Mon, 02 Nov 2026 10:00:00 GMT", "https://a.cz/1"],
    ["<![CDATA[Stará zpráva]]> - iDNES", "iDNES", "Mon, 01 Sep 2026 10:00:00 GMT", "https://a.cz/2"],
    ["Bez data - X", "X", "nesmysl", "https://a.cz/3"],
  ]);
  const n = parseNews(xml, "kb", NOW);
  assert.equal(n.length, 1);
  assert.equal(n[0].title, "Banka zvýšila sazby & poplatky");
  assert.equal(n[0].source, "Deník");
  assert.equal(n[0].bank, "kb");
});

test("mergeNews: deduplikace podle titulku i odkazu, řazení, limit 80", () => {
  const d = (h) => new Date(NOW - h * 36e5).toISOString();
  const a = [{ bank: "kb", title: "Zpráva Á", url: "https://a/1", date: d(5) }, { bank: "kb", title: "Jiná", url: "https://a/2", date: d(1) }];
  const b = [{ bank: "cs", title: "zprava a", url: "https://b/1", date: d(2) }, { bank: "cs", title: "Třetí", url: "https://a/2", date: d(3) }];
  const m = mergeNews([a, b], NOW);
  assert.deepEqual(m.map((x) => x.url), ["https://a/2", "https://b/1"]);
  const many = Array.from({ length: 200 }, (_, i) => ({ bank: "fio", title: "T" + i, url: "https://f/" + i, date: d(i / 10) }));
  assert.equal(mergeNews([many], NOW).length, 80);
});

test("pickApp: páruje podle prodejce, vynechá vedlejší aplikace", () => {
  const r = [
    { trackName: "KB Klíč", sellerName: "Komerční banka, a.s.", userRatingCount: 90000, averageUserRating: 4.1, trackId: 1 },
    { trackName: "KB+", sellerName: "Komerční banka, a.s.", userRatingCount: 50000, averageUserRating: 4.678, trackId: 2, trackViewUrl: "https://apps.apple.com/cz/app/id2" },
    { trackName: "Cizí appka KB", sellerName: "Někdo jiný", userRatingCount: 99999, averageUserRating: 3, trackId: 3 },
  ];
  const a = pickApp(r, /komer/i);
  assert.equal(a.id, 2);
  assert.equal(a.rating, 4.68);
  assert.equal(pickApp([], /x/), null);
});

test("addHistory: jeden záznam denně, max. 90 dní", () => {
  let p = { historie: [{ d: "2026-07-01", r: 4 }, { d: "2026-11-02", r: 4.5 }, { d: "2026-11-03", r: 1 }] };
  const h = addHistory(p, { rating: 4.6, count: 10 }, "2026-11-03");
  assert.deepEqual(h.map((x) => x.d), ["2026-11-02", "2026-11-03"]);
  assert.equal(h[1].r, 4.6);
});

test("parseRepo: oba formáty, vezme poslední", () => {
  assert.deepEqual(parseRepo("VALID_FROM|CNB_REPO_RATE_IN_%\n20250509|3,50\n20240320|5,75\n"), { date: "2025-05-09", rate: 3.5 });
  assert.deepEqual(parseRepo("9.5.2025 3.50\n7. 8. 2026 3,75"), { date: "2026-08-07", rate: 3.75 });
  assert.equal(parseRepo("nic"), null);
});

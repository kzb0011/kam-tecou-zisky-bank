// Testy měsíční aktualizace sazeb na vzorových datech. Spuštění: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseArad, normPeriod, repoForMonth, apply } from "../scripts/arad.mjs";

test("normPeriod", () => {
  assert.equal(normPeriod("20260831"), "2026-08");
  assert.equal(normPeriod("31.08.2026"), "2026-08");
  assert.equal(normPeriod("2026-09"), "2026-09");
  assert.equal(normPeriod("xx"), null);
});

test("parseArad: středník i čárka, desetinná čárka", () => {
  const a = parseArad('"indicator_id";"snapshot_id";"period";"value"\n"A1";"x";"20260831";"1,54"\n"A2";"x";"20260831";"0,14"\n');
  assert.deepEqual(a.map((r) => [r.id, r.period, r.value]), [["A1", "2026-08", 1.54], ["A2", "2026-08", 0.14]]);
  assert.throws(() => parseArad("foo;bar\n1;2"));
});

test("repoForMonth: sazba platná většinu měsíce", () => {
  const rows = [{ date: "2026-05-01", rate: 3.5 }, { date: "2026-08-07", rate: 3.75 }];
  assert.equal(repoForMonth(rows, "2026-08"), 3.75);
  assert.equal(repoForMonth([{ date: "2026-08-20", rate: 4 }, { date: "2026-01-01", rate: 3.5 }], "2026-08"), 3.5);
});

test("apply: nový měsíc přidá řádek indexu a přepíše sazby", () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../data.js", import.meta.url), "utf8"), ctx);
  const D = JSON.parse(JSON.stringify(ctx.window.BANK_DATA));
  const n = D.sektor.index.rady.length;
  const v = { bezny: 0.1, na_pozadani: 1.5, terminovane: 3.3, hypoteky: 4.8, spotrebitelske: 8, kontokorent: 15, karty: 17 };
  const ch = apply(D, "2026-09", v, 3.5, "https://www.cnb.cz/aradb/");
  assert.ok(ch.length);
  assert.equal(D.sektor.index.rady.length, n + 1);
  assert.deepEqual(D.sektor.index.rady.at(-1), ["09/26", 3.5, 1.5, 0.1, 4.8]);
  assert.equal(D.sektor.sazby.obdobi, "září 2026");
  assert.equal(D.sektor.ferovost.ea_obdobi, "srpen 2026");
  assert.equal(D.sektor.sazby.uvery.find((r) => r[0] === "Kreditní karta")[1], 17);
  assert.equal(apply(D, "2026-09", v, 3.5, "https://www.cnb.cz/aradb/").length, 0);
});

// Testy zpracování vedení bank z ARES na vzorových (vymyšlených) datech.
import test from "node:test";
import assert from "node:assert/strict";
import { parseVedeni, platni, zmeny, diff } from "../scripts/vedeni.mjs";

const os = (j, p, od, doo, extra = {}) => ({ datumZapisu: od, ...(doo ? { datumVymazu: doo } : {}), nazevAngazma: "Člen", fyzickaOsoba: { jmeno: j, prijmeni: p, datumNarozeni: "1970-01-01", adresa: { x: 1 } }, ...extra });
const SAMPLE = { zaznamy: [{ primarniZaznam: true, datumAktualizace: "2026-10-01",
  statutarniOrgany: [{ typOrganu: "STATUTARNI_ORGAN", clenoveOrganu: [
    os("JAN", "NOVÁK", "2020-01-01", null),
    os("Eva", "Stará", "2019-01-01", "2026-07-31"),
    os("Petr", "Nový", "2026-08-01", null),
    os("Jan", "Novák", "2016-01-01", "2020-01-01"),
    os("Ida", "Předsedová", "2018-01-01", "2026-05-01"), os("Ida", "Předsedová", "2026-05-01", null),
  ] }],
  ostatniOrgany: [{ typOrganu: "DOZORCI_RADA", clenoveOrganu: [os("Karel", "Dozor", "2026-06-17", null)] }],
}] };

test("parseVedeni: jen jména a data, žádné osobní údaje", () => {
  const v = parseVedeni(SAMPLE);
  assert.deepEqual(platni(v.predstavenstvo), ["Ida Předsedová", "Jan Novák", "Petr Nový"]);
  assert.deepEqual(platni(v.dozorci_rada), ["Karel Dozor"]);
  assert.ok(!JSON.stringify(v).includes("1970"));
});

test("zmeny: příchod a odchod, ne přepis funkce", () => {
  const e = zmeny("kb", "45317054", parseVedeni(SAMPLE), Date.parse("2026-11-03"));
  const s = e.map((x) => `${x.typ} ${x.jmeno} ${x.organ} ${x.datum}`).sort();
  assert.deepEqual(s, [
    "odesel Eva Stará představenstva 2026-07-31",
    "prisel Karel Dozor dozorčí rady 2026-06-17",
    "prisel Petr Nový představenstva 2026-08-01",
  ]);
  assert.ok(e.every((x) => x.url.includes("ico=45317054")));
});

test("diff: rozdíl proti minulému dni", () => {
  const d = diff("fio", "61858374", { predstavenstvo: ["A", "B"], dozorci_rada: [] }, { predstavenstvo: ["B", "C"], dozorci_rada: [] }, "2026-11-03");
  assert.deepEqual(d.map((x) => `${x.typ} ${x.jmeno}`).sort(), ["odesel A", "prisel C"]);
  assert.equal(diff("fio", "1", null, { predstavenstvo: ["A"] }, "x").length, 0);
});

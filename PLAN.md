# Plán prací

Stav: ⬜ čeká · 🔄 rozpracováno · ✅ hotovo · ❌ nejde

1. ✅ Zastavit práci na historických dividendách 2016–2022, stav uložit do podklady/vysledky.md (mimo git).
   - Výroční zprávy nebyly dodány, nic se nezískalo ani nezapsalo.
2. ✅ Najít a ověřit na jedné bance automatický zdroj složení představenstva a dozorčí rady z obchodního rejstříku.
   - Zdroj: ARES (Ministerstvo financí), veřejné REST API bez klíče: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/{IČO}` (data z obchodního rejstříku).
   - Ověřeno na ČS (běh „Sonda obchodního rejstříku“, HTTP 200): `statutarniOrgany[].clenoveOrganu[]` = představenstvo, `ostatniOrgany[]` s `typOrganu: DOZORCI_RADA` = dozorčí rada. U každého člena `datumZapisu` a `datumVymazu` (platní členové výmaz nemají).
   - Rozhodnutí: ukládají se jen jména a data zápisu/výmazu. Data narození a adresy z ARES se nikde neukládají ani nevypisují.
   - Rozhodnutí: or.justice.cz se nescrapuje, používá se jen jako odkaz pro čtenáře.
3. ✅ Skript: denně uložit složení vedení 7 bank, při změně vytvořit zprávu „Banka: X odešel / přišel“ s datem a odkazem na rejstřík. Výstup do data-live.js.
   - `scripts/vedeni.mjs`, volá ho denní `scripts/update.mjs`. Výstup: `LIVE_DATA.vedeni` (platní členové) a `LIVE_DATA.zmeny_vedeni` (typ, orgán, jméno, datum, odkaz na or.justice.cz).
   - Změny se berou z dat zápisu/výmazu v rejstříku za posledních 365 dní, navíc z rozdílu proti minulému dni. Přepis funkce téže osoby (např. na předsedu) se za změnu nepovažuje.
   - Rozhodnutí: datum u změny je datum zápisu do rejstříku (ne datum rozhodnutí banky), na webu se tak i popíše.
   - Při chybě u banky zůstanou její stará data. Jednotkové testy: `tests/vedeni.test.mjs`. Sonda z kroku 2 odstraněna.
4. ⬜ Denní úloha: filtrované titulky z Google News RSS (odvolán, rezignace, odchází, nový člen představenstva, generální ředitel, propouštění, pokuta, ČNB).
5. ⬜ Homepage: sekce „Hot news“ pod hlavními kartami (max. 8, zdroj a datum). Detail banky: její zprávy u tabulky odměn vedení.
6. ⬜ Testy, commit, push, ruční spuštění GitHub Action a ověření zeleného běhu.
7. ⬜ Shrnutí: co funguje, co ne, co je potřeba.

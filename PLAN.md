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
4. ✅ Denní úloha: filtrované titulky z Google News RSS (odvolán, rezignace, odchází, nový člen představenstva, generální ředitel, propouštění, pokuta, ČNB).
   - V `scripts/update.mjs`: pro každou banku jeden dotaz „banka + (klíčová slova) za 30 dní“, výstup `LIVE_DATA.hot` (max. 40).
   - Rozhodnutí: titulek musí jmenovat banku i obsahovat některé klíčové slovo (kontrola i na straně skriptu), aby se nebraly obecné zprávy o sazbách ČNB.
5. ✅ Homepage: sekce „Hot news“ pod hlavními kartami (max. 8, zdroj a datum). Detail banky: její zprávy u tabulky odměn vedení.
   - Homepage: karta „Hot news“ hned pod 4 hlavními kartami. Detail banky: v kartě „Odměny vedení“ aktuální představenstvo z rejstříku a „Změny ve vedení a zprávy“ (max. 6).
   - Rozhodnutí: texty změn jsou rodově neutrální („Nově v představenstvu: …“, „Už není v dozorčí radě: …“), aby se neodhadoval rod podle jména.
   - Metodika doplněna. Test v prohlížeči kontroluje i tyto karty (1280 a 390 px).
5a. ✅ Homepage: „Hot news“ hned pod hlavními 4 kartami jako široká karta přes celou šířku. Nejnovější zpráva větším písmem, pod ní další 3–4 s datem a zdrojem. Jen posledních 14 dní. Když nic není: „Za posledních 14 dní žádné změny ve vedení bank.“
   - Hotovo: hlavní zpráva větším písmem, pod ní až 4 další, okno 14 dní (detail banky dál ukazuje 30 dní zpráv a rok změn v rejstříku).
5b. ✅ Karta „Nejlépe placení šéfové bank“: 5 šéfů místo 3, u odhadů viditelný štítek „odhad“, na mobilu nezvětšit víc než ostatní.
   - Hotovo: kompaktní řádky, štítek „odhad“ u banky. Na 390 px má karta 294 px, ostatní karty 206–495 px (nejvyšší je index férovosti), takže řadu nenatahuje.
6. ✅ Testy, commit, push, ruční spuštění GitHub Action a ověření zeleného běhu.
   - Testy prošly (data, zakázané řetězce, jednotkové testy, prohlížeč 1280/390 px). Denní úloha proběhla zeleně (stav: zprávy 7/7, aplikace 7/7, repo ✓, hot 7/7, vedení 7/7).
   - Opraveno po prvním ostrém běhu: prokuristé se nepočítají do představenstva (ČS měla 8 místo 6); jména se porovnávají bez diakritiky (falešná změna u KB). Dvě falešné změny vzniklé při opravě (ČS, prokuristé) ručně odstraněny z data-live.js.
7. ⬜ Shrnutí: co funguje, co ne, co je potřeba.

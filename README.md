# Kam tečou zisky bank

Webová aplikace o českých bankách 2016–2025: zisky, dividendy do zahraničí, daně, náklady, zaměstnanci, mzdy a odměny vedení. Srovnání s velkými firmami.

Je to čistě statický web (HTML + CSS + JavaScript), bez serveru, bez databáze a bez build kroku. Prohlížeč nestahuje nic z cizích serverů.

## Soubory

| Soubor | Co v něm je |
|---|---|
| `index.html` | Kostra stránky, navigace, meta tagy |
| `style.css` | Vzhled, tmavý režim |
| `fonts.css`, `fonts/` | Písmo Geist uložené přímo na webu (licence OFL) |
| `app.js` | Logika, výpočty a grafy |
| `data.js` | **Všechna čísla.** Tady se data doplňují a opravují |
| `data-live.js` | Denně aktualizovaná data (zprávy, aplikace, repo sazba). Ručně neupravovat |
| `favicon.svg`, `apple-touch-icon.png`, `og.png` | Ikona a náhled pro sociální sítě |
| `robots.txt`, `sitemap.xml`, `CNAME` | Pro vyhledávače a vlastní doménu (vytváří `scripts/set-domain.mjs`) |
| `scripts/update.mjs` | Denní stahování živých dat |
| `scripts/arad.mjs`, `scripts/arad-config.json` | Měsíční aktualizace sazeb z ČNB ARAD |
| `scripts/og-image.mjs` | Znovu vygeneruje `og.png` a ikonu z homepage |
| `scripts/set-domain.mjs` | Nastaví adresu webu (CNAME, sitemap, robots, OG odkazy) |
| `tests/` | Kontroly kvality |

## Jak spustit lokálně

Stačí otevřít `index.html` v prohlížeči (dvojklik). Nic se neinstaluje.

## Nasazení na GitHub Pages

1. Settings → Actions → General → Workflow permissions: **Read and write permissions** → Save.
2. Settings → Pages → Source: **Deploy from a branch**, větev `main`, složka `/ (root)` → Save.
3. Za minutu web běží na `https://<účet>.github.io/<repozitář>/`.

### Vlastní doména

1. `node scripts/set-domain.mjs https://www.vase-domena.cz` (vytvoří `CNAME`, `sitemap.xml`, `robots.txt` a doplní adresu do `index.html`), commit a push.
2. U registrátora domény nastav DNS:
   - pro `www.vase-domena.cz`: záznam **CNAME** `www` → `<účet>.github.io`
   - pro holou doménu `vase-domena.cz`: čtyři záznamy **A** `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (a volitelně **AAAA** `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`)
3. Settings → Pages → Custom domain: zadej doménu, po ověření DNS zaškrtni **Enforce HTTPS**.
4. Doporučení: v Settings → Pages doménu nejdřív ověř (Verified domains), ať ji nikdo jiný nemůže použít.

Adresa `<účet>.github.io` prozrazuje název účtu. Kvůli anonymitě je vhodné mít vlastní doménu a registrovat ji se skrytím údajů ve WHOIS.

## Jak upravit data

Vše je v `data.js`. Příklad: doplnění dividendy ČSOB ze zisku 2024:

```js
"dividendy": [
  ...,
  {"ze_zisku": "2024", "vyplaceno": "2025", "mld": 16.5, "zdroj": "https://…"}
]
```

- `zisk` – čistý zisk v mld. Kč po letech (2016–2025 musí být vyplněné)
- `dividendy` – dohledané výplaty, každá se zdrojem (u KB a Monety se počítají z `dps` = dividenda na akcii × počet akcií)
- `podil_zahranici` – jaká část dividendy odchází do zahraničí (1 = celá, `null` = nelze určit)
- `zamestnanci`, `vynosy`, `pobocky` – po letech, chybějící roky prostě vynech
- odhad se označí `"total_typ": "odhad"` a musí mít vysvětlení v `pozn`

Každé číslo musí mít zdroj. Když údaj nejde dohledat, pole se vynechá a web ukáže „–“.

## Živá data (každý den)

`.github/workflows/update.yml` spouští `scripts/update.mjs` každý den v 5:17 UTC:

- **Zprávy o bankách**: titulky z českých médií přes Google News RSS, posledních 30 dní, bez duplicit, nejvýš 80
- **Hodnocení aplikací**: hlavní aplikace každé banky v českém App Store (iTunes Search API), historie 90 dní
- **Repo sazba ČNB**: poslední hodnota z veřejného souboru ČNB

Když některý zdroj nefunguje, zůstanou v `data-live.js` jeho poslední platná data a úloha nespadne.
Párování aplikací je vidět v logu běhu (řádky `app …`). Kdyby banka dostala špatnou aplikaci, doplň v `scripts/update.mjs` do `BANKS` její `trackId` (číslo z odkazu `apps.apple.com/cz/app/…/id123456789`).

### Ruční spuštění úlohy

Záložka **Actions** → vlevo vyber úlohu („Denní aktualizace dat“, „Měsíční aktualizace sazeb“ nebo „Kontrola kvality“) → **Run workflow** → **Run workflow**.

Commity z automatizace dělá účet `github-actions[bot]`.

## Měsíční sazby a index férovosti (ČNB ARAD)

`.github/workflows/rates.yml` se spouští 3., 10. a 20. den v měsíci. Z ČNB ARAD stáhne průměrné sazby nových obchodů domácností (běžné účty, vklady na požádání, termínované vklady, hypotéky, spotřebitelské úvěry, kontokorent, kreditní karty), k nim 2T repo sazbu platnou většinu měsíce a:

- aktualizuje `sektor.sazby` a `sektor.ferovost` (české sazby; sazby eurozóny zůstávají ruční a web ukáže jejich období),
- přidá řádek do `sektor.index.rady`.

### Jak přidat API klíč

1. Zaregistruj se zdarma v ARAD (https://www.cnb.cz/aradb/) a v uživatelském účtu vygeneruj API klíč.
2. GitHub → repozitář → Settings → Secrets and variables → Actions → **New repository secret**.
3. Name: `CNB_ARAD_KEY`, Secret: vložený klíč → **Add secret**.
4. Kódy ukazatelů patří do `scripts/arad-config.json` (nebo `selection_id` sestavy uložené v ARAD). Bez nich úloha vypíše varování a nic nemění.

Bez klíče úloha jen vypíše varování.

### Sazby spořicích účtů (`ferovost.nabidky_pasma`)

Zatím se doplňují ručně ze srovnávače. Možnosti automatizace bez porušení podmínek webů:

- **sazebníky bank**: většina bank zveřejňuje úrokové sazby v PDF sazebníku nebo na stránce produktu; stahovat jednou měsíčně jen tam, kde to robots.txt a podmínky dovolují,
- **ČNB ARAD** dává jen průměry za sektor, ne nabídky jednotlivých bank,
- **dohoda se srovnávačem** (např. datový export nebo souhlas se stahováním),
- scraping srovnávačů bez jejich souhlasu ne.

## Měření návštěvnosti

`analytics.js` načte GoatCounter (https://kamtecou.goatcounter.com, bez cookies) **jen po kliknutí na „Přijmout“** v cookie liště. Počítá i jednotlivé sekce (`/#sazby`, `/#kb`…) a odkud lidé přišli. Bez souhlasu se nic nenačte ani neodešle, test `tests/qa.mjs` to kontroluje.

Odkazy, které sdílíš, můžeš označit zdrojem, např. `https://kamtecou.cz/?utm_source=facebook#dividendy`. GoatCounter je pak zobrazí v přehledu zdrojů.

## Kontrola kvality

```sh
npm install            # jednou, nainstaluje playwright pro test v prohlížeči
npx playwright install chromium
npm test               # data, zakázané řetězce, jednotkové testy a test v prohlížeči
git config core.hooksPath .githooks   # jednou: testy se spustí před každým commitem
```

- `tests/validate-data.mjs`: každá banka má zisk 2016–2025, dividendy jsou kladná čísla se zdrojem
- `tests/forbidden.mjs`: v repozitáři ani v historii gitu nejsou jména, cizí e-maily a odkazy na třetí strany. Vlastní jména k hlídání: soubor `.forbidden` (není v gitu) nebo GitHub Secret `FORBIDDEN_NAMES` (oddělené čárkou)
- `tests/qa.mjs`: všechny stránky na 1280 a 390 px, chyby v konzoli, `NaN`/`undefined`/`null`/`Infinity`, vodorovný scroll, požadavky mimo web
- Stejné kontroly běží na GitHubu po každém pushi („Kontrola kvality“)

## Co zatím chybí

- Dividendy ČS, ČSOB, UniCredit a Raiffeisenbank za roky 2016–2022 (starší výroční zprávy)
- Odměny představenstva UniCredit a jednotlivé odměny šéfů ČS, ČSOB, UniCredit a Raiffeisenbank

## Kontakt

Jediný kontakt je v `data.js` (pole `"kontakt"`).

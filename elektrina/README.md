# ⚡ Hlídač levné elektřiny

Každý den odpoledne se sám podívá, kolik bude **zítra** stát elektřina na spotovém trhu,
a pošle vám na Telegram přehled:

- 🟢 **nejlevnější souvislá okna** na 1 h, 2 h a 3 h (pračka, myčka, nabíjení),
- 🔴 **nejdražší hodiny**, kdy raději nic nezapínat,
- 📊 **průměr dne**,
- 🚨 **ALERT**, když cena klesne pod vaši hranici (výchozí 1 Kč/kWh) nebo je dokonce **záporná**,
- 🕐 přehled všech 24 hodin s barvičkou (🟢 levné / 🟡 střední / 🔴 drahé).

Ceny jsou **s DPH 21 %** i **bez DPH**, v Kč za kWh.

> **Pozor:** jde o cenu samotné elektřiny na burze (OTE). Na faktuře platíte navíc
> distribuci, poplatky a přirážku dodavatele. Pro rozhodnutí *kdy* zapnout pračku
> je ale podstatné právě to, které hodiny jsou levné a které drahé.

## Jak to funguje (jednoduše)

1. Každý den kolem 13:00 zveřejní operátor trhu **OTE** ceny na zítřek, po 15 minutách.
2. GitHub ve **14:30** spustí skript `hlidac.py`, ten ceny stáhne a přepočítá
   z eur za MWh na **Kč za kWh** podle kurzu ČNB.
3. Pošle vám zprávu na Telegram a uloží ceny do `historie.csv`.
4. V **16:00** se spustí ještě jednou, pro jistotu. Když už zpráva odešla, nic dalšího nepošle.
   Když ceny ještě nejsou, přijde krátká zpráva „ceny zatím nejsou“.

Nic se neplatí: GitHub Actions, Telegram, OTE i ČNB jsou zdarma.

---

## Nastavení krok za krokem (jednou, asi 10 minut)

### Krok 1: Založte si Telegram bota

1. Otevřete Telegram (v mobilu nebo počítači).
2. Do hledání napište **@BotFather** (má modrou fajfku) a otevřete ho.
3. Napište mu `/newbot`.
4. Zeptá se na **jméno** bota. Napište třeba `Hlídač elektřiny`.
5. Zeptá se na **uživatelské jméno**. Musí končit na `bot`, např. `muj_hlidac_elektriny_bot`.
6. BotFather vám pošle **token**. Vypadá nějak takto:
   `7123456789:AAH4k...dlouhý-řetězec...`
   👉 Zkopírujte si ho. **Nikomu ho neukazujte**, je to jako heslo.

### Krok 2: Zjistěte své chat ID

1. V Telegramu najděte svého nového bota (podle uživatelského jména z kroku 1)
   a napište mu cokoli, třeba `ahoj`. **Tohle je důležité**, jinak vám bot nesmí psát.
2. V prohlížeči otevřete tuto adresu. Místo `VAS_TOKEN` vložte token z kroku 1:
   ```
   https://api.telegram.org/botVAS_TOKEN/getUpdates
   ```
3. Zobrazí se text. Najděte v něm `"chat":{"id":` a číslo za tím, např. `"chat":{"id":123456789`.
   👉 To číslo (`123456789`) je vaše **chat ID**.
   (Když se zobrazí jen `"result":[]`, napište botovi znovu a stránku obnovte.)

### Krok 3: Vložte token a chat ID do GitHubu (Secrets)

Secrets jsou trezor na hesla. Skript si je odtud přečte, ale nikdo jiný je neuvidí.

1. Otevřete svůj repozitář na GitHubu.
2. Nahoře klikněte na **Settings** (Nastavení).
3. V levém menu: **Secrets and variables** → **Actions**.
4. Klikněte na zelené tlačítko **New repository secret**.
5. Do **Name** napište přesně `TELEGRAM_TOKEN`, do **Secret** vložte token z kroku 1.
   Klikněte **Add secret**.
6. Znovu **New repository secret**: Name `TELEGRAM_CHAT_ID`, Secret je číslo z kroku 2.
   Klikněte **Add secret**.

### Krok 4: Vyzkoušejte to

1. V repozitáři nahoře klikněte na **Actions**.
2. Vlevo vyberte **Hlídač levné elektřiny**.
3. Vpravo klikněte **Run workflow** a znovu zelené **Run workflow**.
   (Chcete-li zprávu poslat znovu, i když už dnes odešla, zaškrtněte „Odeslat znovu“.)
4. Za minutu by vám měla přijít zpráva na Telegram. 🎉
   Zelená fajfka ✅ znamená, že vše proběhlo. Červený křížek ❌ znamená chybu:
   klikněte na něj a uvidíte, co se stalo. Nejčastěji je to překlep v Secrets.

Od teď to poběží samo každý den.

---

## Jak změnit hranici ceny (a další nastavení)

Vše je v souboru [`nastaveni.toml`](nastaveni.toml). Úprava přímo na GitHubu:

1. Otevřete soubor `elektrina/nastaveni.toml`.
2. Klikněte na ikonu **tužky** ✏️ (vpravo nahoře, „Edit this file“).
3. Změňte číslo, např. `hranice_kc_kwh = 1.0` na `hranice_kc_kwh = 2.5`.
   **Desetinná čísla pište s tečkou** (`2.5`, ne `2,5`).
4. Dole/nahoře klikněte na zelené **Commit changes** → znovu **Commit changes**.

Co se dá nastavit:

| Nastavení | Co dělá | Výchozí |
|---|---|---|
| `hranice_kc_kwh` | pod touto cenou přijde 🚨 ALERT | `1.0` |
| `hranice_s_dph` | `true` = porovnává se cena s DPH, `false` = bez DPH | `true` |
| `dph_procenta` | sazba DPH | `21` |
| `pocet_drahych_hodin` | kolik nejdražších hodin vypsat | `3` |
| `okna_hodiny` | délky oken v hodinách, např. `[1, 2, 3, 4]` | `[1, 2, 3]` |
| `okna_popisky` | popisky k oknům | `["pračka", "myčka", "nabíjení"]` |
| `ukazat_vsechny_hodiny` | přidat přehled všech 24 hodin | `true` |
| `zalozni_kurz_eur` | kurz, kdyby nefungoval web ČNB | `24.5` |

## Historie cen

Soubor [`historie.csv`](historie.csv) se sám doplňuje každý den. Otevřete ho v Excelu
nebo Google Tabulkách. Sloupce:

| Sloupec | Význam |
|---|---|
| `datum` | den dodávky |
| `interval_od`, `interval_do` | 15minutový interval (např. 13:00–13:15) |
| `cena_eur_mwh` | původní cena z OTE v EUR/MWh |
| `cena_kc_kwh_bez_dph` | cena v Kč/kWh bez DPH |
| `cena_kc_kwh_s_dph` | cena v Kč/kWh s DPH |
| `kurz_eur_czk` | použitý kurz ČNB |

Pozn.: Excel v české verzi může čísla s tečkou zobrazit jako text. Pomůže
*Data → Z textu/CSV* a jako oddělovač desetinných míst zvolit tečku.

## Časté otázky

**Zpráva nepřišla.** Podívejte se do záložky **Actions**, jestli tam je ❌. Zkontrolujte,
že jste botovi v Telegramu aspoň jednou napsali (krok 2) a že Secrets jsou pojmenované přesně
`TELEGRAM_TOKEN` a `TELEGRAM_CHAT_ID`.

**Chodí v jinou hodinu.** GitHub někdy spouští naplánované úlohy s pár minutami zpožděním,
to je normální. GitHub navíc počítá čas v UTC, takže v létě (letní čas) přijde zpráva
o hodinu později, v 15:30 a 17:00. Ceny už v tu dobu budou dávno venku.

**Po 60 dnech přestalo chodit.** GitHub vypíná naplánované úlohy v repozitářích, kde se
60 dní nic nezměnilo. Tady se ale historie ukládá denně, takže by se to stávat nemělo.
Kdyby ano: **Actions** → **Hlídač levné elektřiny** → **Enable workflow**.

**Kde se berou data?**
- ceny: OTE, a.s. (oficiální operátor trhu), [ote-cr.cz](https://www.ote-cr.cz/cs/kratkodobe-trhy/elektrina/denni-trh)
- kurz EUR/CZK: Česká národní banka

## Pro zvídavé: spuštění na vlastním počítači

Potřebujete Python 3.11 nebo novější. Nic dalšího se neinstaluje.

```bash
python3 elektrina/hlidac.py --nanecisto                     # jen vypíše zprávu na zítřek
python3 elektrina/hlidac.py --datum 2026-11-15 --nanecisto  # libovolný den
python3 -m unittest discover -s elektrina/testy             # testy
```

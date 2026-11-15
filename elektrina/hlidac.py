#!/usr/bin/env python3
"""Hlídač levné elektřiny pro ČR.

Stáhne spotové ceny denního trhu OTE na zítřek, přepočítá je na Kč/kWh
a pošle přehled na Telegram. Historii ukládá do historie.csv.

Spuštění:
    python3 elektrina/hlidac.py                  # zítřek, odešle na Telegram
    python3 elektrina/hlidac.py --nanecisto      # jen vypíše zprávu, nic neodešle ani neuloží
    python3 elektrina/hlidac.py --datum 2026-11-16 --nanecisto
    python3 elektrina/hlidac.py --vynutit        # odešle znovu, i když už dnes odešlo

Používá jen standardní knihovnu Pythonu (nic se neinstaluje).
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import sys
import time
import tomllib
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SLOZKA = Path(__file__).resolve().parent
NASTAVENI = SLOZKA / "nastaveni.toml"
HISTORIE = SLOZKA / "historie.csv"
ODESLANO = SLOZKA / "odeslano.txt"

PRAHA = ZoneInfo("Europe/Prague")
OTE_URL = "https://www.ote-cr.cz/pw-data/chart-data/01?language=cs&report_date={datum}"
CNB_URL = ("https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/"
           "kurzy-devizoveho-trhu/denni_kurz.txt?date={datum}")
TELEGRAM_URL = "https://api.telegram.org/bot{token}/sendMessage"
HLAVICKY = {"User-Agent": "hlidac-elektriny/1.0"}

DNY = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"]
CSV_SLOUPCE = ["datum", "interval_od", "interval_do", "cena_eur_mwh",
               "cena_kc_kwh_bez_dph", "cena_kc_kwh_s_dph", "kurz_eur_czk"]


class DataNejsou(Exception):
    """OTE ceny pro daný den zatím nezveřejnil."""


# ---------------------------------------------------------------- stahování

def stahni(url: str, pokusy: int = 3) -> bytes:
    posledni = None
    for i in range(pokusy):
        try:
            req = urllib.request.Request(url, headers=HLAVICKY)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # síťová chyba – zkusíme znovu
            posledni = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"Nepodařilo se stáhnout {url}: {posledni}")


def ctvrthodiny_dne(den: date) -> list[datetime]:
    """Začátky všech 15min intervalů dne v pražském čase (92/96/100 podle změny času)."""
    zacatek = datetime(den.year, den.month, den.day, tzinfo=PRAHA).astimezone(timezone.utc)
    konec = datetime(den.year, den.month, den.day, tzinfo=PRAHA) + timedelta(days=1)
    konec = konec.replace(tzinfo=PRAHA).astimezone(timezone.utc)
    casy, t = [], zacatek
    while t < konec:
        casy.append(t.astimezone(PRAHA))
        t += timedelta(minutes=15)
    return casy


def ceny_ote(den: date) -> list[float]:
    """Vrátí 15min ceny v EUR/MWh. Když ještě nejsou, vyhodí DataNejsou."""
    data = json.loads(stahni(OTE_URL.format(datum=den.isoformat())))
    cara = next((c for c in data.get("data", {}).get("dataLine", [])
                 if "15min" in c.get("title", "") and "cena" in c.get("title", "").lower()), None)
    if not cara or not cara.get("point"):
        raise DataNejsou()
    body = sorted(cara["point"], key=lambda p: int(p["x"]))
    ceny = [float(p["y"]) for p in body]
    ocekavano = len(ctvrthodiny_dne(den))
    if len(ceny) != ocekavano:
        raise DataNejsou() if len(ceny) < ocekavano else RuntimeError(
            f"OTE vrátil {len(ceny)} intervalů, čekal jsem {ocekavano}.")
    return ceny


def kurz_cnb(den: date) -> tuple[float, str]:
    """Kurz EUR/CZK z ČNB platný pro daný den. Vrací (kurz, datum vyhlášení)."""
    text = stahni(CNB_URL.format(datum=den.strftime("%d.%m.%Y"))).decode("utf-8")
    radky = text.splitlines()
    for r in radky:
        casti = r.split("|")
        if len(casti) == 5 and casti[3] == "EUR":
            return float(casti[4].replace(",", ".")) / float(casti[2]), radky[0].split(" ")[0]
    raise RuntimeError("V kurzovním lístku ČNB chybí EUR.")


# ---------------------------------------------------------------- výpočty

@dataclass
class Interval:
    od: datetime
    do: datetime
    eur_mwh: float
    bez_dph: float  # Kč/kWh
    s_dph: float    # Kč/kWh


def priprav(den: date, ceny_eur: list[float], kurz: float, dph: float) -> list[Interval]:
    """EUR/MWh → Kč/kWh: krát kurz, děleno 1000."""
    out = []
    for zac, eur in zip(ctvrthodiny_dne(den), ceny_eur):
        bez = eur * kurz / 1000
        konec = (zac.astimezone(timezone.utc) + timedelta(minutes=15)).astimezone(PRAHA)
        out.append(Interval(zac, konec, eur, bez, bez * (1 + dph / 100)))
    return out


def hodiny(intervaly: list[Interval]) -> list[Interval]:
    """Průměr vždy čtyř čtvrthodin = hodinová cena."""
    out = []
    for i in range(0, len(intervaly), 4):
        k = intervaly[i:i + 4]
        prumer = lambda a: sum(getattr(x, a) for x in k) / len(k)
        out.append(Interval(k[0].od, k[-1].do, prumer("eur_mwh"), prumer("bez_dph"), prumer("s_dph")))
    return out


def nejlevnejsi_okno(intervaly: list[Interval], delka_h: float) -> Interval | None:
    """Souvislé okno dané délky s nejnižší průměrnou cenou (může začít v kteroukoli čtvrthodinu)."""
    n = int(round(delka_h * 4))
    if n <= 0 or n > len(intervaly):
        return None
    nejlepsi = None
    for i in range(len(intervaly) - n + 1):
        k = intervaly[i:i + n]
        bez = sum(x.bez_dph for x in k) / n
        if nejlepsi is None or bez < nejlepsi.bez_dph:
            nejlepsi = Interval(k[0].od, k[-1].do, sum(x.eur_mwh for x in k) / n,
                                bez, sum(x.s_dph for x in k) / n)
    return nejlepsi


def useky(intervaly: list[Interval], podminka) -> list[tuple[datetime, datetime, float]]:
    """Sloučí po sobě jdoucí čtvrthodiny splňující podmínku. Vrací (od, do, nejnižší cena s DPH)."""
    out, aktualni = [], None
    for x in intervaly:
        if podminka(x):
            if aktualni:
                aktualni = (aktualni[0], x.do, min(aktualni[2], x.s_dph))
            else:
                aktualni = (x.od, x.do, x.s_dph)
        elif aktualni:
            out.append(aktualni)
            aktualni = None
    if aktualni:
        out.append(aktualni)
    return out


# ---------------------------------------------------------------- zpráva

def kc(x: float) -> str:
    return f"{x:.2f}".replace(".", ",").replace("-", "−")


def cas(od: datetime, do: datetime) -> str:
    return f"{od:%H:%M}–{'24:00' if do.hour == 0 and do.minute == 0 else f'{do:%H:%M}'}"


def sestav_zpravu(den: date, intervaly: list[Interval], kurz: float, kurz_info: str, nast: dict) -> str:
    h = hodiny(intervaly)
    prumer_bez = sum(x.bez_dph for x in intervaly) / len(intervaly)
    prumer_s = sum(x.s_dph for x in intervaly) / len(intervaly)
    hranice = float(nast["hranice_kc_kwh"])
    s_dph = bool(nast.get("hranice_s_dph", True))
    cena_pro_hranici = (lambda x: x.s_dph) if s_dph else (lambda x: x.bez_dph)

    r = [f"⚡ <b>Ceny elektřiny – {DNY[den.weekday()]} {den.day}. {den.month}. {den.year}</b>",
         "<i>Spotová cena OTE (jen silová elektřina, bez distribuce)</i>", ""]

    zaporne = useky(intervaly, lambda x: x.eur_mwh < 0)
    pod = useky(intervaly, lambda x: cena_pro_hranici(x) < hranice)
    if zaporne:
        r.append("🚨🚨 <b>ALERT: ZÁPORNÁ CENA!</b>")
        r += [f"• {cas(a, b)} (nejníže {kc(m)} Kč/kWh)" for a, b, m in zaporne]
        r.append("")
    if pod:
        r.append(f"🚨 <b>ALERT: cena pod {kc(hranice)} Kč/kWh</b> ({'s' if s_dph else 'bez'} DPH)")
        r += [f"• {cas(a, b)} (nejníže {kc(m)} Kč/kWh s DPH)" for a, b, m in pod]
        r.append("")

    r.append("🟢 <b>Nejlevnější souvislá okna</b>")
    popisky = list(nast.get("okna_popisky", []))
    for i, d in enumerate(nast.get("okna_hodiny", [1, 2, 3])):
        o = nejlevnejsi_okno(intervaly, d)
        if o:
            pop = f" ({popisky[i]})" if i < len(popisky) and popisky[i] else ""
            delka = f"{d:g}".replace(".", ",")
            r.append(f"• {delka} h{pop}: <b>{cas(o.od, o.do)}</b> · {kc(o.s_dph)} Kč/kWh "
                     f"(bez DPH {kc(o.bez_dph)})")
    r.append("")

    r.append("🔴 <b>Nejdražší hodiny</b> (kdy nespotřebovávat)")
    for x in sorted(h, key=lambda x: -x.bez_dph)[: int(nast.get("pocet_drahych_hodin", 3))]:
        r.append(f"• {cas(x.od, x.do)} · {kc(x.s_dph)} Kč/kWh (bez DPH {kc(x.bez_dph)})")
    r.append("")

    nejl, nejd = min(intervaly, key=lambda x: x.bez_dph), max(intervaly, key=lambda x: x.bez_dph)
    r.append(f"📊 <b>Průměr dne:</b> {kc(prumer_s)} Kč/kWh s DPH (bez DPH {kc(prumer_bez)})")
    r.append(f"Nejníže {kc(nejl.s_dph)} ({cas(nejl.od, nejl.do)}), "
             f"nejvýše {kc(nejd.s_dph)} ({cas(nejd.od, nejd.do)}) Kč/kWh s DPH")

    if nast.get("ukazat_vsechny_hodiny", True):
        serazene = sorted(x.bez_dph for x in h)
        tretina, dve_tretiny = serazene[len(h) // 3], serazene[2 * len(h) // 3]
        r += ["", "🕐 <b>Všechny hodiny</b> (Kč/kWh s DPH)", "<pre>"]
        for x in h:
            znak = "🟢" if x.bez_dph < tretina else ("🟡" if x.bez_dph < dve_tretiny else "🔴")
            r.append(f"{x.od:%H}h {znak} {kc(x.s_dph):>6}")
        r.append("</pre>")

    r += ["", f"<i>Kurz ČNB {kurz_info}: {f'{kurz:.3f}'.replace('.', ',')} Kč/€ · DPH {nast['dph_procenta']} %</i>"]
    return "\n".join(r)


# ---------------------------------------------------------------- Telegram, CSV

def posli_telegram(text: str) -> None:
    token = os.environ.get("TELEGRAM_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        raise RuntimeError("Chybí TELEGRAM_TOKEN nebo TELEGRAM_CHAT_ID (GitHub Secrets).")
    telo = urllib.parse.urlencode({"chat_id": chat, "text": text, "parse_mode": "HTML",
                                   "disable_web_page_preview": "true"}).encode()
    req = urllib.request.Request(TELEGRAM_URL.format(token=token), data=telo, headers=HLAVICKY)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            odpoved = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Telegram odmítl zprávu: {e.code} {e.read().decode(errors='replace')}") from None
    if not odpoved.get("ok"):
        raise RuntimeError(f"Telegram odmítl zprávu: {odpoved}")


def uloz_historii(den: date, intervaly: list[Interval], kurz: float) -> None:
    """Přidá den do historie.csv. Když tam už je, přepíše ho (žádné duplicity)."""
    radky = []
    if HISTORIE.exists():
        with HISTORIE.open(encoding="utf-8", newline="") as f:
            radky = [r for r in csv.DictReader(f) if r["datum"] != den.isoformat()]
    for x in intervaly:
        radky.append({"datum": den.isoformat(), "interval_od": f"{x.od:%H:%M}",
                      "interval_do": cas(x.od, x.do).split("–")[1],
                      "cena_eur_mwh": f"{x.eur_mwh:.2f}", "cena_kc_kwh_bez_dph": f"{x.bez_dph:.4f}",
                      "cena_kc_kwh_s_dph": f"{x.s_dph:.4f}", "kurz_eur_czk": f"{kurz:.3f}"})
    radky.sort(key=lambda r: r["datum"])  # stabilní řazení zachová pořadí intervalů v rámci dne
    with HISTORIE.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_SLOUPCE)
        w.writeheader()
        w.writerows(radky)


def uz_odeslano(den: date) -> bool:
    return ODESLANO.exists() and ODESLANO.read_text().strip() == den.isoformat()


# ---------------------------------------------------------------- hlavní běh

def main() -> int:
    p = argparse.ArgumentParser(description="Hlídač levné elektřiny")
    p.add_argument("--datum", help="den ve tvaru RRRR-MM-DD (výchozí: zítřek)")
    p.add_argument("--nanecisto", action="store_true", help="jen vypsat, nic neodesílat ani neukládat")
    p.add_argument("--vynutit", action="store_true", help="odeslat, i když už pro ten den odešlo")
    a = p.parse_args()

    nast = tomllib.loads(NASTAVENI.read_text(encoding="utf-8"))
    dnes = datetime.now(PRAHA).date()
    den = date.fromisoformat(a.datum) if a.datum else dnes + timedelta(days=1)

    def odeslat(text: str) -> None:
        if a.nanecisto:
            print(text)
        else:
            posli_telegram(text)

    if not a.nanecisto and not a.vynutit and uz_odeslano(den):
        print(f"Přehled na {den} už byl odeslán, končím.")
        return 0

    try:
        ceny = ceny_ote(den)
    except DataNejsou:
        print(f"Ceny na {den} zatím nejsou.")
        odeslat(f"⏳ Ceny elektřiny na {den.day}. {den.month}. zatím nejsou. Zkusím to znovu později.")
        return 0

    try:
        kurz, kurz_info = kurz_cnb(dnes)
    except Exception as e:
        print(f"Kurz ČNB nedostupný ({e}), používám záložní z nastavení.")
        kurz, kurz_info = float(nast["zalozni_kurz_eur"]), "(záložní z nastavení)"

    intervaly = priprav(den, ceny, kurz, float(nast["dph_procenta"]))
    zprava = sestav_zpravu(den, intervaly, kurz, kurz_info, nast)

    if a.nanecisto:
        print(zprava)
        return 0
    uloz_historii(den, intervaly, kurz)
    posli_telegram(zprava)
    ODESLANO.write_text(den.isoformat() + "\n")
    print(f"Odesláno, historie uložena ({len(intervaly)} intervalů).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as chyba:
        print(f"CHYBA: {chyba}", file=sys.stderr)
        if "--nanecisto" not in sys.argv:
            try:
                posli_telegram(f"⚠️ Hlídač elektřiny narazil na chybu:\n{html.escape(str(chyba))[:500]}")
            except Exception:
                pass
        sys.exit(1)

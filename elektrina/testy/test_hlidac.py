"""Testy hlídače bez internetu. Spuštění: python3 -m unittest discover elektrina/testy"""

import json
import sys
import tempfile
import threading
import unittest
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import hlidac  # noqa: E402

SLOZKA = Path(__file__).resolve().parent
OTE = (SLOZKA / "ote-2026-11-16.json").read_bytes()
NAST = {"hranice_kc_kwh": 1.0, "hranice_s_dph": True, "dph_procenta": 21, "pocet_drahych_hodin": 3,
        "okna_hodiny": [1, 2, 3], "okna_popisky": ["pračka", "myčka", "nabíjení"],
        "ukazat_vsechny_hodiny": True}


class Vypocty(unittest.TestCase):
    def setUp(self):
        with mock.patch.object(hlidac, "stahni", return_value=OTE):
            self.ceny = hlidac.ceny_ote(date(2026, 11, 16))
        self.iv = hlidac.priprav(date(2026, 11, 16), self.ceny, 25.0, 21)

    def test_ctvrthodiny(self):
        self.assertEqual(len(hlidac.ctvrthodiny_dne(date(2026, 11, 16))), 96)
        self.assertEqual(len(hlidac.ctvrthodiny_dne(date(2026, 3, 29))), 92)   # jaro: hodina chybí
        self.assertEqual(len(hlidac.ctvrthodiny_dne(date(2026, 10, 25))), 100)  # podzim: hodina navíc

    def test_prepocet(self):
        self.assertEqual(len(self.ceny), 96)
        self.assertAlmostEqual(self.ceny[0], 170.0)
        self.assertAlmostEqual(self.iv[0].bez_dph, 170.0 * 25 / 1000)   # 4,25 Kč/kWh
        self.assertAlmostEqual(self.iv[0].s_dph, 4.25 * 1.21)

    def test_hodiny_a_okna(self):
        h = hlidac.hodiny(self.iv)
        self.assertEqual(len(h), 24)
        okno1 = hlidac.nejlevnejsi_okno(self.iv, 1)
        self.assertLessEqual(okno1.bez_dph, min(x.bez_dph for x in h))  # posuvné okno ≤ nejlevnější celá hodina
        okno3 = hlidac.nejlevnejsi_okno(self.iv, 3)
        self.assertEqual((okno3.do - okno3.od).total_seconds(), 3 * 3600)

    def test_alert_a_zaporna_cena(self):
        ceny = list(self.ceny)
        ceny[40:44] = [-5.0, -3.0, 10.0, 10.0]
        iv = hlidac.priprav(date(2026, 11, 16), ceny, 25.0, 21)
        z = hlidac.sestav_zpravu(date(2026, 11, 16), iv, 25.0, "test", NAST)
        self.assertIn("ZÁPORNÁ CENA", z)
        self.assertIn("10:00–10:30", z)
        self.assertIn("pod 1,00 Kč/kWh", z)
        self.assertIn("10:00–11:00", z)

    def test_bez_alertu(self):
        z = hlidac.sestav_zpravu(date(2026, 11, 16), self.iv, 25.0, "test", NAST)
        self.assertNotIn("ALERT", z)
        self.assertIn("Průměr dne", z)

    def test_data_nejsou(self):
        prazdne = json.dumps({"data": {"dataLine": []}}).encode()
        with mock.patch.object(hlidac, "stahni", return_value=prazdne):
            with self.assertRaises(hlidac.DataNejsou):
                hlidac.ceny_ote(date(2026, 11, 16))

    def test_historie_bez_duplicit(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(hlidac, "HISTORIE", Path(d) / "h.csv"):
            hlidac.uloz_historii(date(2026, 11, 16), self.iv, 25.0)
            hlidac.uloz_historii(date(2026, 11, 16), self.iv, 25.0)
            radky = (Path(d) / "h.csv").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(radky), 97)  # hlavička + 96 čtvrthodin
            self.assertTrue(radky[-1].startswith("2026-11-16,23:45,24:00,"))


class Telegram(unittest.TestCase):
    def test_odeslani(self):
        prijato = {}

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                prijato["cesta"] = self.path
                prijato["data"] = parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"ok": true}')

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.handle_request, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_port}/bot{{token}}/sendMessage"
        with mock.patch.object(hlidac, "TELEGRAM_URL", url), \
             mock.patch.dict("os.environ", {"TELEGRAM_TOKEN": "123:ABC", "TELEGRAM_CHAT_ID": "42"}):
            hlidac.posli_telegram("<b>ahoj</b>")
        srv.server_close()
        self.assertEqual(prijato["cesta"], "/bot123:ABC/sendMessage")
        self.assertEqual(prijato["data"]["chat_id"], ["42"])
        self.assertEqual(prijato["data"]["parse_mode"], ["HTML"])

    def test_chybi_secrets(self):
        with mock.patch.dict("os.environ", {"TELEGRAM_TOKEN": "", "TELEGRAM_CHAT_ID": ""}):
            with self.assertRaises(RuntimeError):
                hlidac.posli_telegram("x")


if __name__ == "__main__":
    unittest.main()

# Příběh domu – Praha (Dominius reality)

Statická stránka `index.html` (GitHub Pages) + `worker.js` (Cloudflare Worker pro AI příběh). Bez buildu.

## Data
Geokódování Nominatim (max 1 dotaz/s, cache v localStorage) → jeden SPARQL dotaz na Wikidata (60 m: P762, pamětní desky, Stolpersteine, P547, lidé s P551/P19) → úryvek z cs.wikipedia. Ručně ověřená data patří do objektu `H` v `index.html` (klíč `ulice číslo` bez diakritiky, např. `nerudova 47`); mají přednost a jsou označena „Ručně ověřeno“.

## Nasazení
1. **GitHub Pages:** zveřejněte obsah této složky (např. samostatné repo, nebo Settings → Pages). Zdroj: větev + složka s `index.html`.
2. **Worker:** `npm i -g wrangler && wrangler login`, poté ve složce s `worker.js`:
   `wrangler deploy worker.js --name pribehdomu-worker --compatibility-date 2025-01-01`
3. **Secret (klíč nikdy do stránky):** `wrangler secret put ANTHROPIC_API_KEY`
4. **Povolený původ:** `wrangler deploy ... --var ALLOWED_ORIGIN:https://pribehdomu.dominius.cz` (jinak Worker přijme jakýkoli původ).
5. V `index.html` nastavte `WORKER_URL` na adresu Workeru (`https://pribehdomu-worker.<účet>.workers.dev`).
6. **Doména:** v DNS dominius.cz přidejte `CNAME pribehdomu → <uživatel>.github.io`; do repa soubor `CNAME` s obsahem `pribehdomu.dominius.cz`; v Settings → Pages zapněte Enforce HTTPS.

## Poznámky
- Limit 1 příběh / 10 s na IP používá Cache API (platí v rámci jednoho datacentra). Pro přísný globální limit použijte Workers KV nebo Rate Limiting binding.
- Odkazy na Památkový katalog a Mapy IPR vedou na úvodní stránky; hlubší odkazy si ověřte a doplňte.
- Při velkém provozu zvažte vlastní proxy pro Nominatim (jeho podmínky: max 1 dotaz/s, identifikace aplikace).

// Jednorázová sonda: ověří, že ARES vrací složení orgánů z obchodního rejstříku.
// Vypisuje jen strukturu klíčů a jména (žádná data narození ani adresy).
const ico = process.argv[2] || "45244782";
const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/${ico}`;
const r = await fetch(url, { headers: { accept: "application/json" } });
console.log("HTTP", r.status, url);
const j = await r.json();
const SKIP = /narozen|adres|sidlo|bydl|rodne/i;
function tree(o, p = "", d = 0) {
  if (d > 7 || o === null || typeof o !== "object") return;
  const keys = Array.isArray(o) ? (o.length ? [0] : []) : Object.keys(o);
  for (const k of keys) {
    const path = p + (Array.isArray(o) ? `[${o.length}]` : "." + k);
    if (SKIP.test(String(k))) { console.log(path, "(vynecháno)"); continue; }
    const v = o[k];
    if (v && typeof v === "object") tree(v, path, d + 1);
    else console.log(path, "=", JSON.stringify(v).slice(0, 60));
  }
}
tree(j);

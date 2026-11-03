// Nastaví adresu webu: CNAME (jen pro vlastní doménu), sitemap.xml, robots.txt a absolutní odkazy v index.html.
// Použití:  node scripts/set-domain.mjs https://www.example.cz          (vlastní doména)
//           node scripts/set-domain.mjs https://ucet.github.io/repo/   (adresa GitHub Pages)
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];
if (!arg || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[\w.-]*)*\/?$/i.test(arg)) { console.error("Zadej adresu, např. https://www.example.cz"); process.exit(1); }
const base = arg.endsWith("/") ? arg : arg + "/";
const host = new URL(base).hostname;
const today = new Date().toISOString().slice(0, 10);

if (host.endsWith(".github.io")) await rm(join(root, "CNAME"), { force: true });
else await writeFile(join(root, "CNAME"), host + "\n");

await writeFile(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
</urlset>
`);
await writeFile(join(root, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /tests/\nDisallow: /scripts/\n\nSitemap: ${base}sitemap.xml\n`);

const p = join(root, "index.html");
let h = await readFile(p, "utf8");
h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${base}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${base}$2`)
  .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${base}og.png$2`)
  .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${base}og.png$2`);
await writeFile(p, h);
console.log(`Adresa nastavena na ${base}${host.endsWith(".github.io") ? "" : ` (CNAME: ${host})`}`);

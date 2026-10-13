// OSM mahalle sınırlarını sitenin kullanacağı sade dosyalara çevirir.
// Girdi:  data/osm-<ilce>.geojson (scripts/mahalle-sinir.js çıktısı), public/data/ilceler/<ilce>.json
// Çıktı:  public/data/sinirlar/<ilce>.json  (mahalle slug, ad, aktif, poligon)
//         public/data/sinirlar/index.json   (ilçe → kapsayan kutu; konum hangi ilçe dosyasını yükleyeceğini buradan bulur)
// Kullanım: node scripts/sinir-yayinla.js
// Veri © OpenStreetMap katkıcıları, ODbL.

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const ASCII = { ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u" };
const sikistir = (s) => s.toLocaleLowerCase("tr-TR").replace(/[ışçğöü]/g, (c) => ASCII[c]).replace(/[^a-z0-9]/g, "");
// 5 ondalık ≈ 1 metre; dosyayı yarıya indirir
const yuvarla = (n) => Math.round(n * 1e5) / 1e5;

const cikis = path.join(KOK, "public/data/sinirlar");
fs.mkdirSync(cikis, { recursive: true });
const index = [];

for (const dosya of fs.readdirSync(path.join(KOK, "data")).filter((f) => /^osm-.+\.geojson$/.test(f))) {
  const ilceSlug = dosya.slice(4, -8);
  const ilceYolu = path.join(KOK, "public/data/ilceler", `${ilceSlug}.json`);
  if (!fs.existsSync(ilceYolu)) { console.log(`- ${ilceSlug}: ilçe JSON'u yok, atlandı`); continue; }
  const ilce = JSON.parse(fs.readFileSync(ilceYolu, "utf8"));
  const mahalleler = new Map(ilce.mahalleler.map((m) => [sikistir(m.ad), m]));

  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const cikti = [];
  for (const f of JSON.parse(fs.readFileSync(path.join(KOK, "data", dosya), "utf8")).features) {
    const m = mahalleler.get(sikistir(f.properties.ad));
    if (!m) { console.log(`- ${ilceSlug}: "${f.properties.ad}" ilçe JSON'unda yok`); continue; }
    // Polygon da MultiPolygon da [[halka, delik...], ...] biçimine getirilir
    const poligonlar = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map((p) => p.map((halka) => halka.map(([x, y]) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        return [yuvarla(x), yuvarla(y)];
      })));
    cikti.push({ slug: m.slug, ad: m.ad, aktif: m.aktif, poligonlar });
  }

  fs.writeFileSync(path.join(cikis, `${ilceSlug}.json`), JSON.stringify({ il: ilce.il, ilce: ilce.ilce, mahalleler: cikti }));
  index.push({ ilce: ilceSlug, il: ilce.il.slug, kutu: [minX, minY, maxX, maxY].map(yuvarla) });
  console.log(`✓ ${ilceSlug}: ${cikti.length}/${ilce.mahalleler.length} mahalle`);
}

fs.writeFileSync(path.join(cikis, "index.json"), JSON.stringify(index) + "\n");

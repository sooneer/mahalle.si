// Bir ilçenin mahalle sınırlarını OpenStreetMap'ten (Nominatim) indirir.
// Overpass yoğunken yedek yol: her mahalledeki bir eczanenin konumu ters sorgulanır,
// dönen mahalle sınırı (boundary=administrative) alınır.
// Kullanım: node scripts/mahalle-sinir.js ATAŞEHİR
// Çıktı:    data/osm-<ilce>.geojson (gitignore'da). Veri © OpenStreetMap katkıcıları, ODbL.

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const ilceAdi = (process.argv[2] || "").toLocaleUpperCase("tr-TR");
if (!ilceAdi) { console.error("İlçe adı gerekli: node scripts/mahalle-sinir.js ATAŞEHİR"); process.exit(1); }

const oku = (p) => JSON.parse(fs.readFileSync(path.join(KOK, p), "utf8"));
const ilce = oku("data/ilce-mahalle.json").find((i) => i.AD === ilceAdi);
if (!ilce) { console.error(`${ilceAdi} ilce-mahalle.json içinde yok.`); process.exit(1); }
const eczaneler = oku("data/eczane.json").features;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "mahalle.si/0.1 (https://mahalle.si)"; // Nominatim kullanım kuralı: tanımlayıcı User-Agent, saniyede en fazla 1 istek

async function tersSorgu([boylam, enlem]) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=geojson&zoom=13&polygon_geojson=1&lat=${enlem}&lon=${boylam}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).features?.[0];
}

(async () => {
  const sonuc = new Map(); // osm id → feature
  const eksik = [];
  for (const m of ilce.NEIGHBORHOODS) {
    const eczane = eczaneler.find((e) => e.properties.neighborhoodId === m.KIMLIKNO);
    if (!eczane) { eksik.push(`${m.AD} (eczanesi yok, konum bilinmiyor)`); continue; }
    const f = await tersSorgu(eczane.geometry.coordinates).catch((e) => ({ hata: e.message }));
    await bekle(1100);
    if (!f || f.hata || f.properties.category !== "boundary") {
      eksik.push(`${m.AD} (${f?.hata || "sınır bulunamadı"})`); continue;
    }
    const osmAd = f.properties.name;
    sonuc.set(f.properties.osm_id, {
      type: "Feature",
      properties: { kimlikNo: m.KIMLIKNO, ad: m.AD, osmAd, osmId: `${f.properties.osm_type}/${f.properties.osm_id}` },
      geometry: f.geometry,
    });
    console.log(`✓ ${m.AD} → ${osmAd}`);
  }

  const slug = ilceAdi.toLocaleLowerCase("tr-TR").replace(/[ışçğöü]/g, (c) => ({ ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u" })[c]).replace(/\s+/g, "-");
  const cikis = path.join(KOK, "data", `osm-${slug}.geojson`);
  fs.writeFileSync(cikis, JSON.stringify({ type: "FeatureCollection", features: [...sonuc.values()] }));
  console.log(`\n${sonuc.size}/${ilce.NEIGHBORHOODS.length} mahalle sınırı → ${path.relative(KOK, cikis)}`);
  if (eksik.length) console.log("Eksik:\n  " + eksik.join("\n  "));
})();
